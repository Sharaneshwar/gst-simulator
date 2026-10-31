# Home network and approved-browser access

The production website permits the configured home public IP and individually approved browsers. VPN IP addresses are not allowlisted. App login is still required after the network check.

A browser can request approval, but cannot approve itself. Approval/revocation is available only through the private server operator tool, with database credentials. A student or an instructor using the app's demo login cannot grant browser exceptions.

## Production configuration

Set these private server variables on **both Render and Vercel**:

- `NETWORK_ACCESS_ENABLED=1`
- `NETWORK_HOME_IPS`: comma-separated exact public IP addresses. Update this when the ISP changes the home address.
- `NETWORK_GATEWAY_SECRET`: the same private, randomly generated 32-byte base64url value on both hosts. Never prefix this key with `VITE_`.

On Vercel also set:

- `GST_API_ORIGIN`: the HTTPS origin of the Render backend, without `/api`.
- `VITE_NETWORK_ACCESS=1`: public build flag; it contains no secret.

Keep the existing `VITE_API_BASE` pointing to the Render API. The browser obtains short-lived network grants through the same-origin `/api/network` function and sends them with API requests. The new gate does not proxy bulk-upload payloads through Vercel Functions, so existing file-size limits are preserved.

Render rejects app API calls without a valid network grant. Its health endpoint remains public for monitoring and free-tier keepalive. Vercel middleware protects the HTML and static assets. Client IPs come from the official Vercel `ipAddress` helper; arbitrary forwarded-IP headers are not trusted by the Render API.

## Approve or revoke a browser

1. In the browser that needs access, open the website, enter a recognizable browser name, and choose **Request browser access**. On the allowed home network, use **Browser access** in the footer (or `/api/network?action=page`) to request an exception before travelling.
2. Review its request ID and label through the private operator command below.
3. Approve the exact request ID, then select **Check access** in that browser.

From `backend`, with private server/database environment variables available:

```sh
node scripts/device-access.js list
node scripts/device-access.js approve <request-id> "Owner Mac — in-app browser"
node scripts/device-access.js revoke <request-id>
```

Approvals last 90 days. The credential is an opaque random 256-bit value in a `Secure`, `HttpOnly`, `SameSite=Strict`, host-only cookie; only its hash is stored in the database. Clearing cookies, using another browser/profile, revocation or expiration requires a new approval. A revoked credential cannot be approved again; request a new credential instead.

This is browser authorization, not proof of a physical Mac. A person with the ability to copy browser credentials could transfer the authorization. No browser fingerprint, MAC address or VPN address is treated as device identity.

Approved-device grants expire in 60 seconds, with device status checked on each API call. Revocation immediately prevents new middleware/API access. Home grants also expire in 60 seconds; an already issued grant may remain valid until that expiry after a network change. No public HTTP approval endpoint exists.

## Rollback

Revoke an individual browser using the command above. To intentionally remove all network restrictions, set `NETWORK_ACCESS_ENABLED=0` on both hosts and `VITE_NETWORK_ACCESS=0` on Vercel, then redeploy. That rollback makes the website public again; normal account login remains enforced. The additive `network_devices` table can remain in place when reverting the code.
