import csv,json,zipfile,statistics,re
from collections import defaultdict
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Build local postal masters from the Department of Posts CSV and GeoNames IN.zip. See docs/postal-data-sources.md.')
parser.add_argument('--source-dir',type=Path,required=True,help='Folder containing pincodes.csv and geonames-IN.zip')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1];src=args.source_dir
states={1:'Jammu and Kashmir',2:'Himachal Pradesh',3:'Punjab',4:'Chandigarh',5:'Uttarakhand',6:'Haryana',7:'Delhi',8:'Rajasthan',9:'Uttar Pradesh',10:'Bihar',11:'Sikkim',12:'Arunachal Pradesh',13:'Nagaland',14:'Manipur',15:'Mizoram',16:'Tripura',17:'Meghalaya',18:'Assam',19:'West Bengal',20:'Jharkhand',21:'Odisha',22:'Chhattisgarh',23:'Madhya Pradesh',24:'Gujarat',26:'Dadra and Nagar Haveli and Daman and Diu',27:'Maharashtra',29:'Karnataka',30:'Goa',31:'Lakshadweep',32:'Kerala',33:'Tamil Nadu',34:'Puducherry',35:'Andaman and Nicobar Islands',36:'Telangana',37:'Andhra Pradesh',38:'Ladakh'}
def norm(x):return re.sub('[^a-z]','',x.lower())
lookup={norm(v):str(k).zfill(2) for k,v in states.items()};lookup.update({'andamanandnicoin':'35','chattisgarh':'22','dadraandnagarhav':'26','megalaya':'17','orissa':'21','pondicherry':'34','uttaranchal':'05','damananddiu':'26','dadraandnagarhaveli':'26','andamannicobarislands':'35'})
geo=defaultdict(list)
with zipfile.ZipFile(src/'geonames-IN.zip') as z:
 for line in z.read('IN.txt').decode().splitlines():
  c=line.split('\t')
  try:
   lat,lon=float(c[9]),float(c[10])
   if 6<=lat<=38 and 68<=lon<=98:geo[c[1]].append((lat,lon))
  except (ValueError,IndexError):pass
rows={};unmapped=set()
with (src/'pincodes.csv').open(encoding='cp1252') as f:
 for row in csv.DictReader(f):
  pin=row['Pincode'].strip();code=lookup.get(norm(row['StateName']));district=row['District'].strip().title()
  if not re.fullmatch(r'\d{6}',pin):continue
  if norm(district) in ['leh','lehladakh','kargil']:code='38'
  if not code:unmapped.add(row['StateName']);continue
  key=(pin,code,district)
  rec=rows.setdefault(key,[pin,code,district,[]])
  name=re.sub(r'\s+(B\.O|S\.O|H\.O)$','',row['Office Name']).strip()
  if name and name not in rec[3]:rec[3].append(name)
for r in rows.values():
 points=geo.get(r[0]);r.extend([round(statistics.median(p[0] for p in points),5),round(statistics.median(p[1] for p in points),5)] if points else [None,None])
data={'sources':[{'url':'https://www.data.gov.in/sites/default/files/dataurl31052019/Pincode_30052019.csv','publisher':'Department of Posts via data.gov.in','license':'GODL-India','retrieved':'2026-11-02'},{'url':'https://download.geonames.org/export/zip/IN.zip','publisher':'GeoNames','license':'CC BY 4.0','retrieved':'2026-11-02','use':'Estimated postal-area coordinates, not jurisdiction boundaries'}],'columns':['pincode','stateCode','district','localities','latitude','longitude'],'rows':sorted(rows.values())}
p=root/'backend/data/postal-directory.json';p.write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
print(json.dumps({'postalAreas':len(rows),'withCoordinates':sum(bool(r[4]) for r in rows.values()),'states':len(set(r[1] for r in rows.values())),'sizeBytes':p.stat().st_size,'unmapped':sorted(unmapped)}))
