const DEFAULT_FRONTEND_URL = "http://localhost:3000";

/**
 * FRONTEND_URL supports a comma-separated list so a deployment can serve
 * from more than one origin at once (e.g. the apex domain and its `www`
 * subdomain) without every browser-facing feature — CORS, OAuth popup
 * postMessage targets, email links — needing its own copy of this parsing.
 */
function parsedFrontendUrls(): string[] {
    const raw = process.env.FRONTEND_URL?.trim();
    if (!raw) return [DEFAULT_FRONTEND_URL];
    const urls = raw
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean);
    return urls.length > 0 ? urls : [DEFAULT_FRONTEND_URL];
}

/** Every origin the frontend may be served from — for CORS allow-lists. */
export function allowedFrontendOrigins(): string[] {
    return parsedFrontendUrls();
}

/**
 * The one canonical frontend URL — for building a single outbound link
 * (an email, an OAuth popup's postMessage target). The first entry when
 * FRONTEND_URL lists several.
 */
export function primaryFrontendUrl(): string {
    return parsedFrontendUrls()[0];
}
