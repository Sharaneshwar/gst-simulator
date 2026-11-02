import { ipAddress } from "@vercel/functions";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
const unavailable = () =>
  new Response("Unable to unlock access. Please try again shortly.", {
    status: 503,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
export async function unlockRoute(request) {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, {
      status: 405,
      headers: { ...headers, Allow: "GET, HEAD" },
    });
  // Link previews and HEAD probes must not create an access session.
  if (
    request.method === "HEAD" ||
    /prefetch/i.test(
      `${request.headers.get("purpose") || ""} ${request.headers.get("sec-purpose") || ""}`,
    )
  )
    return new Response(null, { status: 204, headers });
  if (process.env.NETWORK_ACCESS_ENABLED !== "1")
    return new Response(null, {
      status: 303,
      headers: { ...headers, Location: "/" },
    });
  const ip = ipAddress(request),
    key = process.env.NETWORK_GATEWAY_SECRET,
    origin = process.env.GST_API_ORIGIN;
  if (!ip || !origin || !key || key.length < 43) return unavailable();
  try {
    const response = await fetch(new URL("/api/network/route-unlock", origin), {
      method: "POST",
      headers: {
        "x-gst-gateway-key": key,
        "x-gst-client-ip": ip,
        cookie: request.headers.get("cookie") || "",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
    if (response.status === 429)
      return new Response(
        "Too many access requests. Please try again shortly.",
        {
          status: 429,
          headers: {
            ...headers,
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": response.headers.get("retry-after") || "900",
          },
        },
      );
    if (!response.ok || (await response.json()).allowed !== true)
      return unavailable();
    const cookie = response.headers.get("set-cookie");
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: "/",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      },
    });
  } catch {
    return unavailable();
  }
}
