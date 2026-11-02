"use strict";
const { BlockList, isIP } = require("node:net");
/** Match explicit IPs and CIDR subnets; malformed entries never grant access.
 * Kept in each deployment root because Vercel and Render deploy independently.
 */
function matchesIpAllowlist(ip, configured) {
  const version = typeof ip === "string" ? isIP(ip) : 0;
  if (!version) return false;
  const rules = new BlockList();
  for (const entry of String(configured || "").split(",")) {
    const parts = entry.trim().split("/");
    const address = parts[0];
    const family = isIP(address);
    if (!family || parts.length > 2) continue;
    const type = family === 4 ? "ipv4" : "ipv6";
    try {
      if (parts.length === 1) rules.addAddress(address, type);
      else if (/^(0|[1-9]\d*)$/.test(parts[1])) {
        const prefix = Number(parts[1]);
        if (prefix <= (family === 4 ? 32 : 128))
          rules.addSubnet(address, prefix, type);
      }
    } catch {
      // Ignore an invalid rule without opening access to unrelated addresses.
    }
  }
  return rules.check(ip, version === 4 ? "ipv4" : "ipv6");
}
module.exports = { matchesIpAllowlist };
