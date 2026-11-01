import { ipAddress } from "@vercel/functions";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  const action = String(req.query?.action || "session");
  const method = action === "unlock" ? "POST" : "GET";
  if (!["session", "unlock"].includes(action)) {
    res.setHeader("Content-Type", "application/json");
    return res.status(403).json({ message: "Access blocked." });
  }
  if (req.method !== method)
    return res.status(405).json({ message: "Unsupported request." });
  const blocked = () => res.status(403).json({ message: "Access blocked." });
  const origin = process.env.GST_API_ORIGIN;
  const key = process.env.NETWORK_GATEWAY_SECRET;
  if (!origin || !key || key.length < 43) return blocked();
  const incoming = new URL(req.url, `https://${req.headers.host}`);
  if (method === "POST" && req.headers.origin !== incoming.origin)
    return blocked();
  const headers = new Headers(
    Object.fromEntries(
      Object.entries(req.headers).filter(([, v]) => typeof v === "string"),
    ),
  );
  const ip = ipAddress(new Request(incoming, { headers }));
  if (!ip) return blocked();
  const gatewayHeaders = {
    "Content-Type": "application/json",
    "x-gst-gateway-key": key,
    "x-gst-client-ip": ip,
    cookie: req.headers.cookie || "",
  };
  const request = (route, options = {}) =>
    fetch(new URL("/api/network/" + route, origin), {
      headers: gatewayHeaders,
      signal: AbortSignal.timeout(45000),
      redirect: "error",
      ...options,
    });
  try {
    const response = await request(action, {
      method,
      ...(method === "POST"
        ? {
            body: JSON.stringify({
              password:
                typeof req.body?.password === "string" &&
                req.body.password.length <= 128
                  ? req.body.password
                  : "",
            }),
          }
        : {}),
    });
    const data = await response.json();
    const retry = response.headers.get("retry-after");
    if (retry) res.setHeader("Retry-After", retry);
    if (action === "session" && data.allowed !== true) return blocked();
    const cookie = response.headers.get("set-cookie");
    if (cookie) res.setHeader("Set-Cookie", cookie);
    return res.status(response.status).json(data);
  } catch {
    return res
      .status(503)
      .json({ message: "Unable to load this page. Please try again shortly." });
  }
}
