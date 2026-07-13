const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function isTrustedLocalOrigin(origin, allowedOrigins = []) {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    try {
        return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
    } catch {
        return false;
    }
}
