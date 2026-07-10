/**
 * Indian Kanoon API client (https://api.indiankanoon.org).
 *
 * Powers the assistant's Indian case-law research tools. All requests are
 * POSTs authenticated with `Authorization: Token <INDIAN_KANOON_API_TOKEN>`.
 * When the token is not configured the tools are not offered to the model at
 * all (see isIndianKanoonEnabled), so these functions can assume a token.
 */

const API_BASE = "https://api.indiankanoon.org";

export function isIndianKanoonEnabled(): boolean {
    return !!process.env.INDIAN_KANOON_API_TOKEN?.trim();
}

function apiToken(): string {
    const token = process.env.INDIAN_KANOON_API_TOKEN?.trim();
    if (!token) {
        throw new Error(
            "INDIAN_KANOON_API_TOKEN must be set to use Indian Kanoon tools.",
        );
    }
    return token;
}

async function ikPost(path: string): Promise<unknown> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Token ${apiToken()}`,
            Accept: "application/json",
        },
    });
    if (res.status === 429) {
        throw new Error(
            "Indian Kanoon rate limit reached. Stop Indian Kanoon calls for this turn.",
        );
    }
    if (!res.ok) {
        throw new Error(
            `Indian Kanoon request failed (${res.status} ${res.statusText}).`,
        );
    }
    return res.json();
}

/** Strip HTML tags/entities from Indian Kanoon titles, headlines, and docs. */
export function stripIkHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>(?=.)/gi, "\n")
        .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export type IndianKanoonSearchResult = {
    doc_id: number;
    title: string;
    court: string | null;
    date: string | null;
    snippet: string | null;
    url: string;
};

/**
 * Full-text search across Indian Kanoon (judgments, statutes, tribunal
 * orders). Supports their query operators, e.g. `doctypes:supremecourt`,
 * `fromdate:1-1-2020`, `todate:31-12-2024`, ANDD/ORR, quoted phrases.
 */
export async function searchIndianKanoon(params: {
    query: string;
    pagenum?: number;
}): Promise<{ results: IndianKanoonSearchResult[]; found?: string }> {
    const pagenum = Math.max(0, params.pagenum ?? 0);
    const raw = (await ikPost(
        `/search/?formInput=${encodeURIComponent(params.query)}&pagenum=${pagenum}`,
    )) as {
        docs?: {
            tid?: number;
            title?: string;
            headline?: string;
            docsource?: string;
            publishdate?: string;
        }[];
        found?: string;
        errmsg?: string;
    };
    if (raw?.errmsg) throw new Error(raw.errmsg);
    const results: IndianKanoonSearchResult[] = (raw?.docs ?? [])
        .filter((d) => typeof d.tid === "number")
        .map((d) => ({
            doc_id: d.tid as number,
            title: stripIkHtml(d.title ?? ""),
            court: d.docsource ?? null,
            date: d.publishdate ?? null,
            snippet: d.headline ? stripIkHtml(d.headline) : null,
            url: `https://indiankanoon.org/doc/${d.tid}/`,
        }));
    return { results, ...(raw?.found ? { found: raw.found } : {}) };
}

export type IndianKanoonDoc = {
    doc_id: number;
    title: string;
    court: string | null;
    text: string;
    truncated: boolean;
    url: string;
};

const DEFAULT_DOC_MAX_CHARS = 60_000;

/** Fetch a judgment/order/statute by Indian Kanoon doc id as plain text. */
export async function readIndianKanoonDoc(params: {
    docId: number;
    maxChars?: number;
}): Promise<IndianKanoonDoc> {
    const raw = (await ikPost(`/doc/${params.docId}/`)) as {
        tid?: number;
        title?: string;
        doc?: string;
        docsource?: string;
        errmsg?: string;
    };
    if (raw?.errmsg) throw new Error(raw.errmsg);
    const maxChars = params.maxChars ?? DEFAULT_DOC_MAX_CHARS;
    const fullText = stripIkHtml(raw?.doc ?? "");
    const truncated = fullText.length > maxChars;
    return {
        doc_id: params.docId,
        title: stripIkHtml(raw?.title ?? ""),
        court: raw?.docsource ?? null,
        text: truncated ? fullText.slice(0, maxChars) : fullText,
        truncated,
        url: `https://indiankanoon.org/doc/${params.docId}/`,
    };
}
