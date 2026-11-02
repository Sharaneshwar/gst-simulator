# Home network and route-based access

The portal permits the configured home IPv4/IPv6 addresses or CIDR subnets and valid network-unlock sessions. VPN IPs are not individually allowlisted. The ordinary student/instructor account login is still required.

## Unlock from any network

Open **`/godmode`** on the same hostname and browser/profile used for the portal. A normal GET visit automatically creates a 90-day network-access session and redirects to `/`. There is no password field or second submission. `/godmode/` also works. `/admin` no longer offers an unlock page.

This intentionally makes knowledge of the route sufficient to pass the network gate. Anyone who discovers or receives the URL can unlock their browser. The route is not a substitute for account authentication: invited users still log in normally, and existing roles/data permissions are retained. It is not linked from the blocked page or app footer, but it should not be treated as an undiscoverable secret.

The cookie remains valid across IP/VPN changes. Clearing cookies or using a different browser/profile requires visiting the route again. Revisiting with a valid access session reuses it without extending its original expiry. This is browser access, not physical-Mac identification.

## Private gateway and configuration

Keep matching `NETWORK_GATEWAY_SECRET` values on Vercel and Render; retain `NETWORK_ACCESS_ENABLED=1`, matching `NETWORK_HOME_IPS`, and the existing `GST_API_ORIGIN`, `VITE_NETWORK_ACCESS` and `VITE_API_BASE` settings. Exact IPs and CIDR ranges are supported; for example, `49.36.43.0/24` permits every address from `.0` through `.255`, including other subscribers using that range.

Only the server-side Vercel middleware calls Render's `/api/network/route-unlock` operation, carrying the private gateway credential and platform-provided client IP. The credential is never sent to the browser. The public `/api/network?action=...` function does not expose `route-unlock` as a selectable action. Direct requests without the gateway credential are blocked.

HEAD requests and prefetch probes do not issue sessions; unsupported methods return 405. Missing gateway configuration or unavailable/rejecting backends return 503 without an access cookie. New sessions are limited to five per public IP and 100 globally per 15 minutes, with counters persisted in Neon. Existing valid sessions can still reuse the route after the new-session limit is reached.

Successful unlock creates a random 256-bit `Secure`, `HttpOnly`, `SameSite=Strict`, host-only cookie; only its hash is stored in `network_access_sessions`. Cookie responses and redirects use private no-store caching and no-referrer headers. API grants last 60 seconds, and expiration/revocation are checked on each request. Student passwords/data are not changed by network unlock.

The existing password-validated backend operation remains for compatibility with operator tooling, but the removed `/admin` form is no longer used. Its configured password is not needed by `/godmode`.

List or revoke a session privately from `backend`:

```sh
node scripts/network-admin.js list
node scripts/network-admin.js revoke <session-id>
```

Render's health endpoint stays public for UptimeRobot. Outsiders without a matching network or access cookie still receive the generic blocked page when visiting ordinary app URLs. The old `__Host-gst_browser` device-approval credential and legacy device grants remain unsupported.
