import { ipAddress } from "@vercel/functions";
import { accessPage } from "../network/page.js";
import { blockedPage, blockedHeaders } from "../network/blocked-page.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  const action = String(req.query?.action || "session");
  const method = action === "enroll" ? "POST" : "GET";
  if (!["page", "session", "enroll"].includes(action) || req.method !== method)
    return res.status(405).json({ message: "Unsupported request." });
  const blocked = () => {
    if (action === "page") {
      for (const [key, value] of Object.entries(blockedHeaders)) res.setHeader(key, value);
      return res.status(403).send(blockedPage());
    }
    return res.status(403).json({ message: "Access blocked." });
  };
  const origin = process.env.GST_API_ORIGIN;
  const key = process.env.NETWORK_GATEWAY_SECRET;
  if (!origin || !key || key.length < 43) return blocked();
  const incoming = new URL(req.url, `https://${req.headers.host}`);
  if (method === "POST" && req.headers.origin !== incoming.origin) return blocked();
  const headers = new Headers(
    Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === "string")),
  );
  const ip = ipAddress(new Request(incoming, { headers }));
  if (!ip) return blocked();
  const gatewayHeaders = {
    "Content-Type": "application/json",
    "x-gst-gateway-key": key,
    "x-gst-client-ip": ip,
    cookie: req.headers.cookie || "",
  };
  const request = (route, options = {}) => fetch(new URL("/api/network/" + route, origin), {
    headers: gatewayHeaders,
    signal: AbortSignal.timeout(45000),
    redirect: "error",
    ...options,
  });
  try {
    // Enrollment is available from home or an already-approved browser only.
    if (action !== "session") {
      const check = await request("check", { method: "POST" });
      if (!check.ok || (await check.json()).allowed !== true) return blocked();
    }
    if (action === "page") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(accessPage());
    }
    const response = await request(action, {
      method,
      ...(method === "POST" ? { body: JSON.stringify({ label: String(req.body?.label || "").slice(0, 100) }) } : {}),
    });
    const data = await response.json();
    if (action === "session" && data.allowed !== true) return blocked();
    const cookie = response.headers.get("set-cookie");
    if (cookie) res.setHeader("Set-Cookie", cookie);
    return res.status(response.status).json(data);
  } catch {
    if (action === "page") return blocked();
    return res.status(503).json({ message: "Unable to load this page. Please try again shortly." });
  }
}
