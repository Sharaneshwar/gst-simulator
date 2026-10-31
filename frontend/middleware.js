import { next, ipAddress } from "@vercel/functions";
import { accessPage } from "./network/page.js";
export const config = { runtime: "nodejs" };
export default async function middleware(request) {
  if (process.env.NETWORK_ACCESS_ENABLED !== "1") return next();
  const url = new URL(request.url);
  if (url.pathname === "/api/network") return next();
  const ip = ipAddress(request);
  const homes = String(process.env.NETWORK_HOME_IPS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (ip && homes.includes(ip)) return next();
  const cookie = request.headers.get("cookie") || "";
  const key = process.env.NETWORK_GATEWAY_SECRET;
  const origin = process.env.GST_API_ORIGIN;
  if (
    ip &&
    /(?:^|;\s*)__Host-gst_browser=[A-Za-z0-9_-]{43}(?:;|$)/.test(cookie) &&
    key?.length >= 43 &&
    origin
  ) {
    try {
      const response = await fetch(new URL("/api/network/check", origin), {
        method: "POST",
        headers: { "x-gst-gateway-key": key, "x-gst-client-ip": ip, cookie },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (response.ok && (await response.json()).allowed === true)
        return next();
    } catch {
      /* Fail closed, while keeping enrollment/status available. */
    }
  }
  return new Response(accessPage(), {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
