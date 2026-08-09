const DEFAULT_AUTH_RETURN_PATH = "/lawyering";

export function safeAuthReturnPath(
    candidate: string | null | undefined,
    fallback = DEFAULT_AUTH_RETURN_PATH,
) {
    if (
        !candidate ||
        !candidate.startsWith("/") ||
        candidate.startsWith("//") ||
        candidate.includes("\\")
    ) {
        return fallback;
    }

    try {
        const base = new URL("https://trygavel.local");
        const parsed = new URL(candidate, base);
        if (parsed.origin !== base.origin) return fallback;
        if (["/login", "/signup"].includes(parsed.pathname)) return fallback;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return fallback;
    }
}

export function authReturnPathFromLocation() {
    if (typeof window === "undefined") return DEFAULT_AUTH_RETURN_PATH;
    return safeAuthReturnPath(
        new URLSearchParams(window.location.search).get("next"),
    );
}

export function authPageHref(path: "/login" | "/signup", returnPath: string) {
    if (returnPath === DEFAULT_AUTH_RETURN_PATH) return path;
    return `${path}?next=${encodeURIComponent(returnPath)}`;
}
