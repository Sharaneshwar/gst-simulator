# Home network and administrator access

The portal permits the configured home public IP and valid administrator-unlock sessions. VPN IPs are not individually allowlisted. The ordinary portal account login is still required.

## Unlock from any network

Open **`/admin`** on the same hostname and browser/profile used for the portal. Enter the private access password and select **Unlock Access**. This creates a 90-day session that remains valid across IP/VPN changes. Clearing site cookies or using another browser/profile requires entering the access password again. This is an access session, not physical-Mac identification.

The route is deliberately not linked from the public blocked page or the app footer. Its password is the protection; knowing the route alone does not unlock the app. The password never appears in frontend code or a URL.

The old **Browser access** page, pending requests, private device-approval workflow, `__Host-gst_browser` credential, and device-based network grants have been removed. Legacy `network_devices` rows can remain for history, but grant no access.

## Private configuration

Keep matching `NETWORK_GATEWAY_SECRET` values on Vercel and Render; keep `NETWORK_ACCESS_ENABLED=1`, the home IP allowlist in `NETWORK_HOME_IPS`, and the existing `GST_API_ORIGIN`, `VITE_NETWORK_ACCESS` and `VITE_API_BASE` settings.

Configure the access password using the private database operator tool from `backend`:

```sh
# Supply the new password through stdin, without putting it into a URL or source code.
node scripts/network-admin.js set-password
```

Input is read until EOF; the tool stores a salted scrypt hash in Neon `network_access_settings`. Do not commit passwords or private `.env` files. An optional `NETWORK_ADMIN_PASSWORD_HASH` backend environment variable overrides the database value for isolated tests or managed configuration. No extra Vercel secret is needed.

Attempts are limited to five per public IP per 15 minutes, plus 100 across all IPs per 15 minutes. Counters live in Neon, so restarting Render does not reset them. A missing password configuration fails closed. Only the trusted same-origin gateway can call the backend unlock route; cross-origin unlock requests are rejected before any credential is issued.

Successful unlock creates a random 256-bit `Secure`, `HttpOnly`, `SameSite=Strict`, host-only cookie; only its token hash is stored in `network_access_sessions`. API grants last 60 seconds; revocation and expiration are checked on each request. Unlocking again replaces the existing session in that browser. Site passwords and student data are not changed by network unlock.

List or revoke a session privately:

```sh
node scripts/network-admin.js list
node scripts/network-admin.js revoke <session-id>
```

Render's health endpoint remains public for UptimeRobot. Other outsiders continue to receive the generic 403 blocked page. Only `/admin` and the protected network API entry point are reachable before network authorization. The admin page has a nonce-based Content Security Policy and no-store caching.
