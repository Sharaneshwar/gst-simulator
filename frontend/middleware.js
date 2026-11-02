import { matchesIpAllowlist } from "./network/ip-allowlist.js";
import { randomBytes } from "node:crypto";
import { adminPage, adminHeaders } from "./network/admin-page.js";
import { next, ipAddress } from "@vercel/functions";
import { blockedPage, blockedHeaders } from "./network/blocked-page.js";
export const config = { runtime: "nodejs" };
export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    const nonce = randomBytes(16).toString("base64");
    return new Response(request.method === "HEAD" ? null : adminPage(nonce), {
      headers: adminHeaders(nonce),
    });
  }
  if (process.env.NETWORK_ACCESS_ENABLED !== "1") return next();
  if (url.pathname === "/api/network") return next();
  const ip = ipAddress(request);
  if (matchesIpAllowlist(ip, process.env.NETWORK_HOME_IPS)) return next();
  const cookie = request.headers.get("cookie") || "";
  const key = process.env.NETWORK_GATEWAY_SECRET;
  const origin = process.env.GST_API_ORIGIN;
  if (
    ip &&
    /(?:^|;\s*)__Host-gst_access=[A-Za-z0-9_-]{43}(?:;|$)/.test(cookie) &&
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
      /* Fail closed. The same-origin function checks access separately. */
    }
  }
  return new Response(blockedPage(), { status: 403, headers: blockedHeaders });
}
