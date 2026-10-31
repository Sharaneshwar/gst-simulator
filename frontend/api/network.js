import { ipAddress } from "@vercel/functions";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  const action = String(req.query?.action || "session");
  const method = action === "enroll" ? "POST" : "GET";
  if (!["session", "enroll"].includes(action) || req.method !== method)
    return res.status(405).json({ message: "Unsupported request." });
  const origin = process.env.GST_API_ORIGIN;
  const key = process.env.NETWORK_GATEWAY_SECRET;
  if (!origin || !key || key.length < 43)
    return res
      .status(503)
      .json({
        message: "Access verification is being configured. Try again shortly.",
      });
  const incoming = new URL(req.url, `https://${req.headers.host}`);
  if (method === "POST" && req.headers.origin !== incoming.origin)
    return res
      .status(403)
      .json({ message: "Open this form on the website to request access." });
  const headers = new Headers(
    Object.fromEntries(
      Object.entries(req.headers).filter(([, v]) => typeof v === "string"),
    ),
  );
  const ip = ipAddress(new Request(incoming, { headers }));
  if (!ip)
    return res
      .status(400)
      .json({ message: "Unable to verify the network address." });
  try {
    const response = await fetch(new URL("/api/network/" + action, origin), {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-gst-gateway-key": key,
        "x-gst-client-ip": ip,
        cookie: req.headers.cookie || "",
      },
      ...(method === "POST"
        ? {
            body: JSON.stringify({
              label: String(req.body?.label || "").slice(0, 100),
            }),
          }
        : {}),
      signal: AbortSignal.timeout(45000),
      redirect: "error",
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) res.setHeader("Set-Cookie", cookie);
    return res.status(response.status).json(await response.json());
  } catch {
    return res
      .status(503)
      .json({
        message: "The server is waking up. Please check access again shortly.",
      });
  }
}
