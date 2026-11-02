#!/usr/bin/env python3
"""Download official GST manuals and print HTML manuals to PDFs (Python 3.9+)."""
from __future__ import annotations
import argparse, base64, hashlib, html, json, mimetypes, re, sys, threading, time, unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlsplit, urlunsplit
import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

PORTAL = 'https://www.gst.gov.in'
MODULES = {
 'file-returns': ('File Returns', 'returns'),
 'offline-tools': ('GST Offline Tools', 'offlineutility'),
 'itc': ('Input Tax Credit (ITC)', 'inputtaxcredit'),
 'registration': ('Register with GST', 'enrollmentwithgst'),
}
DEFAULT_MODULES = tuple(MODULES)
DIRECT_MODULES = {
 'eway': ('e-Way Bill System', 'https://docs.ewaybillgst.gov.in/ewb.html', [
  ('Web System', 'usermanual_ewb.pdf'), ('SMS System', 'EWB_SMS.pdf'),
  ('Bulk Generation System', 'EWB_BULK_GEN.pdf'), ('API System', 'EWB_API.pdf'),
  ('Blocking and Unblocking', 'Unblockver1.pdf'), ('Two Factor Authentication', '2FA_help.pdf'),
  ('Interoperable EWB Services', 'Enhancement_of_Interoperable_EWB_Services.pdf')]),
 'einvoice': ('e-Invoice System', 'https://einvoice1.gst.gov.in/', [
  ('Web System', 'EINVOICE_UserManual_Web.pdf'),
  ('Bulk Generation System', 'UserManual_BulkE_invoiceGenerationtool.pdf'),
  ('e-Invoice Process', 'eInvoice_process.pdf'), ('API Sandbox Tool', 'einvoiceapisandbox.pdf'),
  ('QR Code', 'Qrcode_procedure.pdf'), ('e-Commerce Operator', 'ecom_operator.pdf'),
  ('Detailed Overview', 'GST_eInvoiceSystemDetailedOverview.pdf')]),
}
SIMULATOR_MODULES = DEFAULT_MODULES + (
 'logging-in-and-managing-username-and-password', 'authenticate-using-dsc-or-evc',
 'view-taxpayer-s-dashboard', 'make-payments', 'view-ledgers',
 'news-and-updates-download-and-print', 'eway', 'einvoice')
ALLOWED = {'www.gst.gov.in', 'gst.gov.in', 'tutorial.gst.gov.in', 'static.gst.gov.in',
           'docs.ewaybillgst.gov.in', 'einvoice1.gst.gov.in'}

def clean(text): return ' '.join(str(text).split())
def slug(text, limit=100):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Za-z0-9._-]+', '-', text).strip('-.')[:limit] or 'manual'
def canonical(url):
    p = urlsplit(url)
    topic = parse_qs(p.fragment).get('t', [None])[0]
    if topic: return canonical(urljoin(urlunsplit((p.scheme,p.netloc,p.path,'','')), topic))
    return urlunsplit((p.scheme, p.netloc, p.path, p.query, ''))
def safe(url):
    p = urlsplit(url)
    if p.scheme != 'https' or p.hostname not in ALLOWED:
        raise ValueError('Refusing non-official resource: ' + url)
    return url

def parse_toc(text):
    match = re.search(r'\bvar\s+toc\s*=\s*', text)
    if not match: raise ValueError('Unrecognized RoboHelp catalog format')
    result = json.JSONDecoder().raw_decode(text[match.end():])[0]
    if not isinstance(result, list): raise ValueError('Expected catalog array')
    return result

class Fetcher:
    def __init__(self, cache, workers=8, refresh=False, recoveries=None):
        self.cache=cache; cache.mkdir(parents=True, exist_ok=True)
        self.recoveries=recoveries or {}
        self.recovery_urls={canonical(r['url']) for r in self.recoveries.values()}
        for url in self.recovery_urls:
            if urlsplit(url).scheme!='https': raise ValueError('Recovery images require HTTPS')
        self.local=threading.local(); self.lock=threading.Lock(); self.locks={}; self.next=0.; self.refresh=refresh; self.fresh=set()
        self.pool=ThreadPoolExecutor(max_workers=workers)
    def get(self, url):
        url=canonical(url)
        if url not in self.recovery_urls: safe(url)
        key=hashlib.sha256(url.encode()).hexdigest()
        with self.lock: lock=self.locks.setdefault(key,threading.Lock())
        with lock:
            path=self.cache/(key+'.bin'); meta=self.cache/(key+'.json')
            if path.exists() and meta.exists() and (not self.refresh or key in self.fresh): return path,json.loads(meta.read_text())
            if not hasattr(self.local,'session'):
                self.local.session=requests.Session(); self.local.session.headers['User-Agent']='GSTManualDownloader/1.0 (offline educational manuals)'
            for attempt in range(3):
                try:
                    current=url
                    for hop in range(6):
                        if current not in self.recovery_urls: safe(current)
                        with self.lock:
                            delay=max(0,self.next-time.monotonic()); self.next=time.monotonic()+delay+0.08
                        if delay: time.sleep(delay)
                        response=self.local.session.get(current,timeout=(15,90),stream=True,allow_redirects=False)
                        if response.status_code in (301,302,303,307,308):
                            current=urljoin(current,response.headers['Location']); response.close(); continue
                        break
                    response.raise_for_status()
                    partial=path.with_suffix('.part')
                    with partial.open('wb') as stream:
                        for chunk in response.iter_content(131072): stream.write(chunk)
                    info={'url':url,'final_url':current,'content_type':response.headers.get('Content-Type',''),'fetched_at':datetime.now(timezone.utc).isoformat()}
                    response.close(); partial.replace(path); meta.write_text(json.dumps(info)); self.fresh.add(key)
                    return path,info
                except (requests.RequestException,OSError) as error:
                    if isinstance(error,requests.HTTPError) and error.response.status_code==404 and url in self.recoveries:
                        recovery=self.recoveries[url]; recovered,info=self.get(recovery['url'])
                        if hashlib.sha256(recovered.read_bytes()).hexdigest()!=recovery['sha256']:
                            raise ValueError('Preserved screenshot checksum changed: '+recovery['url'])
                        return recovered,dict(info,recovery=dict(recovery,original_url=url))
                    if attempt==2: raise
                    if isinstance(error, requests.HTTPError) and error.response.status_code not in (429,500,502,503,504): raise
                    retry_after=error.response.headers.get('Retry-After','0') if isinstance(error, requests.HTTPError) else '0'
                    time.sleep(max(1+attempt*2,min(60,int(retry_after))) if retry_after.isdigit() else 1+attempt*2)
    def text(self,url): return self.get(url)[0].read_text(encoding='utf-8-sig', errors='replace')
    def close(self): self.pool.shutdown(wait=True)


def discover_modules(fetcher):
    soup=BeautifulSoup(fetcher.text(PORTAL+'/help/helpmodules'),'html.parser')
    for tag in soup.select('header,footer,nav,#demo,#siteDis'): tag.decompose()
    found=dict(MODULES)
    for a in soup.select('a[href]'):
        u=urljoin(PORTAL,a['href']); p=urlsplit(u); title=clean(a.get_text(' ',strip=True))
        if p.hostname in ('www.gst.gov.in','gst.gov.in') and re.fullmatch(r'/help/[A-Za-z0-9]+/?',p.path) and title and p.path.rstrip('/').split('/')[-1] not in ('helpmodules','relatedsites','statevat'):
            route=p.path.strip('/').split('/')[-1]
            if not any(route==value[1] for value in found.values()): found[slug(title).lower()]=(title,route)
    return found


def discover(fetcher, modules, include_faqs=False):
    documents={}; errors=[]
    def add(url,module,group,title,kind='manual'):
        url=canonical(url)
        try: safe(url)
        except ValueError: return
        if not re.search(r'\.(pdf|html?)(?:$|\?)',url,re.I): return
        alias={'module':module,'group':clean(group),'title':clean(title),'kind':kind}
        if url not in documents: documents[url]={'url':url,'module':module,'group':clean(group),'title':clean(title),'kind':kind,'aliases':[]}
        if alias not in documents[url]['aliases']: documents[url]['aliases'].append(alias)
    for module,route in modules:
        print('Discovering: '+module,flush=True)
        if route in DIRECT_MODULES:
            _, landing, files = DIRECT_MODULES[route]
            try:
                links=BeautifulSoup(fetcher.text(landing),'html.parser')
                published={canonical(urljoin(landing,a['href'])) for a in links.select('a[href]')}
                for title,filename in files:
                    url=urljoin(landing,'Documents/'+filename)
                    if url not in published: errors.append({'source':landing,'error':'Official listing no longer links to '+url}); continue
                    add(url,module,title,title)
            except Exception as e: errors.append({'source':landing,'error':str(e)})
            continue
        try: soup=BeautifulSoup(fetcher.text(PORTAL+'/help/'+route),'html.parser')
        except Exception as e: errors.append({'source':route,'error':str(e)}); continue
        for tag in soup.select('header,footer,nav,#demo,#siteDis'): tag.decompose()
        portal_items=[]; projects=set()
        for a in soup.select('a[href]'):
            u=urljoin(PORTAL+'/help/'+route,a['href']); label=clean(a.get_text(' ',strip=True) or a.get('title',''))
            if urlsplit(u).hostname!='tutorial.gst.gov.in': continue
            if parse_qs(urlsplit(u).fragment).get('t'): projects.add(urljoin(u,'.'))
            if not re.search(r'manual',label,re.I) and not (include_faqs and re.search(r'faq|overview|troubleshooting',label,re.I)): continue
            previous=a.find_previous(['h4','h3','h2'])
            title=clean(previous.get_text(' ',strip=True)) if previous else unquote(Path(urlsplit(canonical(u)).path).stem)
            panel=a.find_parent(class_='panel'); heading=panel.find(class_=re.compile(r'panel-heading')) if panel else None
            group=clean(heading.get_text(' ',strip=True)) if heading else title
            portal_items.append((u,module,group,title,'faq' if re.search(r'faq',label,re.I) else 'manual'))
        for project in sorted(projects):
            seen=set()
            def walk(nodes,trail=(),faq=False):
                for node in nodes:
                    name=clean(node.get('name','')); is_faq=faq or bool(re.search(r'faq',name,re.I))
                    if is_faq and not include_faqs: continue
                    if node.get('type')=='book':
                        key=node.get('key','')
                        if not re.fullmatch(r'toc\d*',key) or key in seen: continue
                        if len(seen)>500: raise ValueError('Catalog exceeds safety limit')
                        seen.add(key)
                        try: children=parse_toc(fetcher.text(urljoin(project,'whxdata/'+key+'.new.js')))
                        except Exception as e: errors.append({'source':project+key,'error':str(e)}); continue
                        walk(children,trail+(name,),is_faq)
                    elif node.get('url') and (is_faq or re.search(r'manual',name,re.I)):
                        group=' / '.join(trail) or module
                        title=group if name.lower() in ('manual','user manual') else group+' - '+name
                        add(urljoin(project,node['url']),module,group,title,'faq' if is_faq else 'manual')
            try: walk(parse_toc(fetcher.text(urljoin(project,'whxdata/toc.new.js'))))
            except Exception as e: errors.append({'source':project,'error':str(e)})
        for item in portal_items: add(*item)
    return list(documents.values()),errors


def inline_images(soup, url, fetcher, allow_missing):
    images=[img for img in soup.select('img[src]') if not str(img.get('src','')).startswith('data:') and '/akam/' not in urljoin(url,img['src'])]
    def load(img):
        source=urljoin(url,img['src'])
        try:
            path,meta=fetcher.get(source)
            mime=meta['content_type'].split(';')[0] or mimetypes.guess_type(source)[0] or 'image/png'
            if not mime.startswith('image/'): raise ValueError('Image returned '+mime)
            return img,'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode(),None,meta.get('recovery')
        except Exception as e: return img,None,source+' : '+str(e),None
    failures=[]; recoveries=[]
    for img,data,error,recovery in fetcher.pool.map(load,images):
        if error:
            failures.append(error); img.replace_with(soup.new_tag('p')); continue
        img['src']=data; img.attrs.pop('srcset',None); img.attrs.pop('loading',None)
        if recovery and recovery not in recoveries: recoveries.append(recovery)
    if failures and not allow_missing: raise ValueError('Missing '+str(len(failures))+' screenshots. First: '+failures[0]+' (use --allow-missing-images to save a partial PDF)')
    return len(images)-len(failures),failures,recoveries

PRINT_CSS='''@page{size:A4}body{margin:0!important;font-family:Arial,sans-serif!important;font-size:10pt!important;line-height:1.45!important;overflow:visible!important}img{max-width:100%!important;max-height:250mm!important;width:auto!important;height:auto!important;object-fit:contain;break-inside:avoid}table{max-width:100%!important;width:100%!important}td,th{overflow-wrap:anywhere}h1,h2,h3,h4{break-after:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{overflow-wrap:anywhere}.topic-header,.topic-header-shadow{display:none!important}details{display:block}'''


def prepare_html(doc,fetcher,allow_missing):
    path,meta=fetcher.get(doc['url']); raw=path.read_bytes()
    if raw.lstrip().startswith(b'%PDF-'): return None,0,[],raw
    soup=BeautifulSoup(raw,'html.parser')
    if not soup.body or not soup.find(['h1','h2','h3']): raise ValueError('Response is not a manual HTML page')
    for tag in soup.select('script,noscript,iframe,object,embed,form,base,.topic-header,.topic-header-shadow'): tag.decompose()
    for img in list(soup.select('img[src]')):
        if '/akam/' in urljoin(doc['url'],img['src']): img.decompose()
    warnings=[]
    for link in list(soup.select('link')):
        if 'stylesheet' in link.get('rel',[]) and link.get('href'):
            try:
                css=fetcher.text(urljoin(doc['url'],link['href']))
                css=re.sub(r'@import\s+[^;]+;','',css,flags=re.I)
                css=re.sub(r'url\([^)]*\)','none',css,flags=re.I)
                style=soup.new_tag('style'); style.string=css; link.replace_with(style)
            except Exception as e: warnings.append('Stylesheet: '+str(e)); link.decompose()
        else: link.decompose()
    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            if attr.lower().startswith('on'): del tag[attr]
        if tag.name=='a' and tag.get('href') and not tag['href'].startswith('#'):
            tag['href']=urljoin(doc['url'],tag['href'])
        if tag.name=='details': tag['open']=''
    count,missing,recoveries=inline_images(soup,doc['url'],fetcher,allow_missing); warnings+=missing
    warnings += ['Preserved screenshot: '+json.dumps(r,ensure_ascii=False) for r in recoveries]
    head=soup.head
    if head is None: head=soup.new_tag('head'); soup.html.insert(0,head)
    charset=soup.new_tag('meta',charset='utf-8'); head.insert(0,charset)
    style=soup.new_tag('style'); style.string=PRINT_CSS; head.append(style)
    if missing:
        notice=soup.new_tag('p'); notice.string='Offline export: '+str(len(missing))+' source screenshots could not be retrieved; see manifest.json.'; soup.body.insert(0,notice)
    if recoveries:
        notice=soup.new_tag('p'); notice.string='Offline export: '+str(len(recoveries))+' screenshot recovered from a preserved public copy. Source and checksum are recorded in manifest.json.'; soup.body.insert(0,notice)
    return str(soup),count,warnings,None


def validate_pdf(path):
    with path.open('rb') as stream:
        if stream.read(5)!=b'%PDF-': raise ValueError('Downloaded response is not a PDF')
    reader=PdfReader(str(path)); pages=len(reader.pages)
    if not pages: raise ValueError('PDF has no pages')
    return pages

class Printer:
    def __init__(self,executable=None): self.executable=executable; self.runtime=None; self.browser=None
    def page(self):
        if not self.browser:
            from playwright.sync_api import sync_playwright
            self.runtime=sync_playwright().start()
            if self.executable: self.browser=self.runtime.chromium.launch(executable_path=self.executable,headless=True)
            else:
                try: self.browser=self.runtime.chromium.launch(channel='chrome',headless=True)
                except Exception: self.browser=self.runtime.chromium.launch(headless=True)
        return self.browser.new_page()
    def print(self,content,destination,source):
        page=self.page()
        try:
            page.route('http://**/*',lambda route:route.abort()); page.route('https://**/*',lambda route:route.abort())
            page.set_content(content,wait_until='load',timeout=120000)
            page.wait_for_function('Array.from(document.images).every(i=>i.complete && i.naturalWidth>0)',timeout=60000)
            page.evaluate('document.fonts.ready')
            page.pdf(path=str(destination),format='A4',print_background=True,display_header_footer=True,header_template='<div></div>',footer_template='<div style="font-size:7px;width:100%;padding:0 12mm;color:#555"><a href="'+html.escape(source,quote=True)+'">Official GST source</a><span style="float:right"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',margin={'top':'12mm','bottom':'15mm','left':'12mm','right':'12mm'})
        finally: page.close()
    def close(self):
        if self.browser:self.browser.close()
        if self.runtime:self.runtime.stop()


def write_reports(output,records,errors):
    report={'generated_at':datetime.now(timezone.utc).isoformat(),'source':PORTAL+'/help/helpmodules','discovery_errors':errors,'documents':records}
    temp=output/'manifest.json.part';temp.write_text(json.dumps(report,ensure_ascii=False,indent=2));temp.replace(output/'manifest.json')
    rows=[]
    for r in records:
        file=r.get('file'); local='<a href="'+html.escape(file,quote=True)+'">Open PDF</a>' if file and r.get('status')in('complete','partial') else ''
        issue=r.get('error','') or '; '.join(r.get('warnings',[]))
        rows.append('<tr><td>'+html.escape(r['module'])+'</td><td>'+html.escape(r['title'])+'</td><td>'+html.escape(r.get('status','pending'))+'</td><td>'+local+'</td><td><a href="'+html.escape(r['url'],quote=True)+'">Official source</a></td><td>'+html.escape(issue)+'</td></tr>')
    (output/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>GST User Manuals</title><style>body{font:15px Arial;margin:32px;color:#17294b}table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #ccd3df;text-align:left}th{background:#e8edf5}a{color:#185ba3}</style><h1>GST User Manuals</h1><p>Original PDFs are copied unchanged. HTML manuals are printed from official content with their screenshots. See manifest.json for validation and any failures.</p><table><tr><th>Module</th><th>Manual</th><th>Status</th><th>Offline PDF</th><th>Source</th><th>Error</th></tr>'+''.join(rows)+'</table>',encoding='utf-8')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group();group.add_argument('--modules',nargs='+',default=None,help='file-returns offline-tools itc registration (default: these four)');group.add_argument('--all',action='store_true',help='All Knowledge Portal modules')
    group.add_argument('--simulator',action='store_true',help='All modules matching the simulator, including e-way bill and e-invoice')
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parent/'downloads'/'GST User Manuals')
    parser.add_argument('--image-recoveries',type=Path,help='Explicit, checksum-verified fallback image map (used only after an official 404)')
    parser.add_argument('--include-recovery-references',action='store_true',help='Also download the official IMS draft and GST troubleshooting reference PDFs')
    parser.add_argument('--list',action='store_true',help='Discover and list without creating PDFs');parser.add_argument('--include-faqs',action='store_true');parser.add_argument('--refresh',action='store_true');parser.add_argument('--allow-missing-images',action='store_true');parser.add_argument('--workers',type=int,default=8);parser.add_argument('--limit',type=int);parser.add_argument('--match',help='Case-insensitive regular expression for a test subset');parser.add_argument('--chrome',help='Path to Chrome/Chromium executable');parser.add_argument('--jobs',type=int,default=3,help='Parallel manuals (default: 3, maximum: 4)')
    args=parser.parse_args();output=args.output.expanduser().resolve();output.mkdir(parents=True,exist_ok=True)
    recoveries=json.loads(args.image_recoveries.read_text()) if args.image_recoveries else {}
    fetcher=Fetcher(output/'.cache',min(8,max(1,args.workers)),args.refresh,recoveries);printer=Printer(args.chrome)
    try:
        available=discover_modules(fetcher) if args.all or args.simulator or (args.modules and any(x not in MODULES for x in args.modules)) else dict(MODULES)
        available.update({key:(value[0],key) for key,value in DIRECT_MODULES.items()})
        keys=list(available) if args.all else (list(SIMULATOR_MODULES) if args.simulator else (args.modules or list(DEFAULT_MODULES)))
        unknown=[x for x in keys if x not in available]
        if unknown: parser.error('Unknown modules: '+', '.join(unknown)+'. Available: '+', '.join(available))
        docs,errors=discover(fetcher,[available[x] for x in keys],args.include_faqs)
        if args.include_recovery_references:
            for module,title,url in [
                ('File Returns','Invoice Management System - Official Draft Reference','https://tutorial.gst.gov.in/downloads/news/draft_manual_ims.pdf'),
                ('Authenticate using DSC or EVC','GST Portal Known Issues and Suggested Solutions - DSC Reference','https://tutorial.gst.gov.in/offlineutilities/gsterrorandresolution/gstissuesandsuggestedsolutions.pdf')]:
                if not any(d['url']==url for d in docs):
                    docs.append(dict(url=url,module=module,group='Official Reference PDFs',title=title,kind='reference',aliases=[],version_note='Companion reference in its published version; does not replace the current HTML manual.'))
        if not docs: raise ValueError('No manuals found; inspect the discovery errors: '+json.dumps(errors))
        if args.match: docs=[d for d in docs if re.search(args.match,d['title']+' '+d['url'],re.I)]
        if args.limit: docs=docs[:args.limit]
        print('Discovered '+str(len(docs))+' unique documents.',flush=True)
        previous={}
        if (output/'manifest.json').exists(): previous={d['url']:d for d in json.loads((output/'manifest.json').read_text())['documents']}
        records=[]
        for doc in docs:
            r=dict(doc);r['status']='pending'
            old=previous.get(r['url'])
            if old and old.get('status') in ('complete','partial'):
                aliases=r['aliases']; r.update(old)
                r['aliases']=old.get('aliases',[])+[a for a in aliases if a not in old.get('aliases',[])]
            records.append(r)
        selected_count=len(records)
        selected_urls={r['url'] for r in records}
        records.extend(old for url,old in previous.items() if url not in selected_urls)
        if args.list:
            # Listing must not destroy previously completed resume records.
            for r in records:
                old=previous.get(r['url'])
                if old and old.get('status') in ('complete','partial'): r.update(old)
        write_reports(output,records,errors)
        if args.list:
            for d in docs:print(d['module']+' | '+d['title']+' | '+d['url'])
            return 1 if errors else 0
        def process(item):
            index, original = item
            r=dict(original); local_printer=Printer(args.chrome)
            try:
                print('[%d/%d] %s'%(index+1,len(records),r['title']),flush=True)
                old=previous.get(r['url'],{});oldpath=output/old.get('file','__missing__')
                if not args.refresh and old.get('status')=='complete' and oldpath.is_file() and hashlib.sha256(oldpath.read_bytes()).hexdigest()==old.get('sha256'):
                    print('  already downloaded: '+r['title'],flush=True);return r
                rel=Path(slug(r['module']))/slug(r['group'],85)/(slug(r['title'],100)+'--'+hashlib.sha256(r['url'].encode()).hexdigest()[:8]+'.pdf')
                dest=output/rel;dest.parent.mkdir(parents=True,exist_ok=True);part=dest.with_suffix('.part.pdf')
                try:
                    if urlsplit(r['url']).path.lower().endswith('.pdf'):
                        source,meta=fetcher.get(r['url']);part.write_bytes(source.read_bytes());count=0;warnings=[];method='original-pdf'
                    else:
                        content,count,warnings,pdf=prepare_html(r,fetcher,args.allow_missing_images)
                        if pdf is not None:part.write_bytes(pdf);method='original-pdf'
                        else:local_printer.print(content,part,r['url']);method='printed-html'
                    pages=validate_pdf(part);part.replace(dest)
                    r.update(status='partial' if any(' : ' in w for w in warnings) else 'complete',file=str(rel),method=method,pages=pages,screenshots=count,warnings=warnings,bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
                    r.pop('error',None)
                    print('  saved %s (%s pages, %s screenshots): %s'%(method,pages,count,r['title']),flush=True)
                except Exception as e:
                    if part.exists():part.unlink()
                    r.update(status='failed',error=str(e));print('  FAILED '+r['title']+': '+str(e),flush=True)
                return r
            finally: local_printer.close()
        # Interleave modules so each requested folder fills from the start.
        from collections import deque
        queues={}
        for index,r in enumerate(records[:selected_count]):queues.setdefault(r['module'],deque()).append((index,r))
        ordered=[]
        while any(queues.values()):
            for queue in queues.values():
                if queue:ordered.append(queue.popleft())
        with ThreadPoolExecutor(max_workers=min(4,max(1,args.jobs))) as jobs:
            futures={jobs.submit(process,item):item[0] for item in ordered}
            for future in as_completed(futures):
                records[futures[future]]=future.result();write_reports(output,records,errors)
        write_reports(output,records,errors)
        failures=sum(r['status']!='complete' for r in records)
        print('Finished: %s complete, %s incomplete. Index: %s'%(len(records)-failures,failures,output/'index.html'),flush=True)
        return 1 if failures or errors else 0
    finally:printer.close();fetcher.close()
if __name__=='__main__':
    try:sys.exit(main())
    except KeyboardInterrupt:print('\nStopped. Run the same command to resume.',file=sys.stderr);sys.exit(130)
    except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
