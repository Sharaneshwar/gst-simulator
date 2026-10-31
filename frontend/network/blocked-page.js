export const blockedHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};

export function blockedPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access blocked</title><style>
*{box-sizing:border-box}body{margin:0;background:#f0f0f0;color:#454545;font:16px/1.6 system-ui,-apple-system,sans-serif}header{background:white;border-bottom:1px solid #ddd;padding:48px 24px}header>div,main{max-width:1000px;margin:auto}h1{font-size:clamp(32px,5vw,54px);font-weight:500;line-height:1.2;margin:0 0 12px}header p{font-size:clamp(18px,2.5vw,25px);margin:0;color:#656565}.illustration{margin:48px 24px 0;border:1px solid #d4d4d4;border-radius:10px 10px 0 0;overflow:hidden;background:white}.bar{height:30px;background:#999;padding:9px 14px;display:flex;gap:7px}.bar i{width:12px;height:12px;border-radius:50%;background:#eee}.symbol{display:grid;place-items:center;min-height:260px;padding:40px}svg{width:128px;height:128px}.details{padding:32px 24px 48px;background:white;border-top:1px solid #ddd}.details>div{max-width:952px;margin:auto}h2{font-size:23px;font-weight:500;margin:0 0 10px}.details p{margin:0;max-width:680px;color:#666}.code{font-size:13px;color:#777;margin-top:20px!important}@media(max-width:600px){header{padding-top:32px}.illustration{margin-top:28px}.symbol{min-height:210px}}
</style></head><body><header><div><h1>Sorry, you have been blocked</h1><p>You are unable to access this website.</p></div></header><main><div class="illustration" aria-hidden="true"><div class="bar"><i></i><i></i><i></i></div><div class="symbol"><svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><circle cx="64" cy="64" r="64" fill="#bc2525"/><path d="M43 43l42 42m0-42L43 85" stroke="white" stroke-width="13" stroke-linecap="square"/></svg></div></div></main><section class="details"><div><h2>Access restricted</h2><p>If you believe this is a mistake, please contact the site owner.</p><p class="code">403 · Access blocked</p></div></section></body></html>`;
}
