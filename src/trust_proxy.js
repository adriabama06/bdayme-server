/**
 * Express "trust proxy" setup that accepts docker service names, like
 * POSTGRES_HOST=db already does: entries that are not an IP/subnet are
 * resolved through DNS (docker's embedded DNS resolves "traefik" to its
 * container IP) and re-resolved periodically, because the proxy IP changes
 * whenever its container is recreated.
 *
 * TRUST_PROXY accepts a comma-separated mix of:
 *   - docker service names:  traefik
 *   - single IPs:            172.19.0.5
 *   - subnets:               172.19.0.0/16
 *   - proxy-addr ranges:     loopback, linklocal, uniquelocal
 */

import dns from "dns";

const RESOLVE_INTERVAL_MS = 30_000;
const RESOLVE_TIMEOUT_MS = 5_000;

// IP, subnet or one of the proxy-addr predefined ranges -> pass through as is
function is_literal(entry) {
    return (
        /^(loopback|linklocal|uniquelocal)$/i.test(entry) ||
        /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(entry) || // IPv4 or subnet
        entry.includes(":") // IPv6 (or subnet)
    );
}

// resolve4 skips /etc/hosts, so fall back to lookup (needed for localhost/plain hosts)
async function resolve_host(hostname) {
    try {
        return await dns.promises.resolve4(hostname);
    }
    catch(err) {
        try {
            const { address } = await dns.promises.lookup(hostname, { family: 4 });
            return [address];
        }
        catch {
            return [];
        }
    }
}

export default async function setup_trust_proxy(app) {
    const entries = (process.env.TRUST_PROXY?.split(",") ?? [])
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);

    let trusted = null;

    function apply(list, source) {
        const next = [...new Set(list)].sort();

        // Only update when it really changed: if DNS hiccups (or the proxy is
        // being restarted), the previous list is kept instead of trusting nothing
        if(trusted !== null && JSON.stringify(next) === JSON.stringify(trusted)) return;

        trusted = next;
        app.set("trust proxy", trusted);
        console.log(`[TRUST_PROXY] Trusting ${trusted.length > 0 ? trusted.join(", ") : "nothing"} (${source})`);
    }

    async function update(source) {
        const resolved = [];

        for(const entry of entries) {
            if(is_literal(entry)) {
                resolved.push(entry);
                continue;
            }

            const ips = await resolve_host(entry);

            if(ips.length === 0) {
                console.warn(`[TRUST_PROXY] Could not resolve '${entry}' yet, retrying...`);
                return; // keep the current trust list untouched
            }

            resolved.push(...ips);
        }

        apply(resolved, source);
    }

    if(entries.length === 0) {
        apply([], "TRUST_PROXY is not set");
        console.warn("[TRUST_PROXY] X-Forwarded-For will be ignored, set TRUST_PROXY to your proxy (e.g. 'traefik')");
        return;
    }

    // First resolution, bounded so boot never hangs on DNS
    await Promise.race([update("boot"), new Promise(resolve => setTimeout(resolve, RESOLVE_TIMEOUT_MS))]);

    // The proxy IP changes when its container is recreated: keep re-resolving
    setInterval(() => update("refresh"), RESOLVE_INTERVAL_MS).unref();
}
