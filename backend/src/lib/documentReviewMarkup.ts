import JSZip from "jszip";

/**
 * Review-markup extraction: tracked changes and comment bubbles from
 * .docx, and annotations (sticky notes, highlights with text, free-text
 * boxes) from PDF.
 *
 * The plain-text extractors intentionally present documents in "accepted
 * view", which silently drops exactly what a lawyer reviewing a redline
 * asks about ("summarise the comment bubbles", "who inserted this
 * clause?"). These helpers return a markdown section that the extraction
 * paths append to the document text so the model can see and cite the
 * markup. Empty string when a document has none.
 */

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x?[0-9a-fA-F]+;/g, (m) => {
            const code = m.startsWith("&#x")
                ? parseInt(m.slice(3, -1), 16)
                : parseInt(m.slice(2, -1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : m;
        });
}

/** Concatenate all <w:t>/<w:delText> text inside an XML fragment. */
function textOf(xmlFragment: string): string {
    const parts: string[] = [];
    const re = /<w:(?:t|delText)(?:\s[^>]*)?>([\s\S]*?)<\/w:(?:t|delText)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xmlFragment))) {
        parts.push(decodeXmlEntities(m[1] ?? ""));
    }
    return parts.join("");
}

function attr(tag: string, name: string): string | null {
    const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
    return m ? decodeXmlEntities(m[1] ?? "") : null;
}

function truncate(value: string, max = 300): string {
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed.length > max
        ? `${collapsed.slice(0, max)}…`
        : collapsed;
}

function formatDate(raw: string | null): string {
    if (!raw) return "";
    const day = raw.slice(0, 10);
    return day ? ` on ${day}` : "";
}

async function zipEntryText(
    zip: JSZip,
    path: string,
): Promise<string | null> {
    const entry =
        zip.file(path) ?? zip.file(path.replace(/\//g, "\\"));
    if (!entry) return null;
    return entry.async("string");
}

/**
 * Extract tracked changes (insertions/deletions with authors) and comments
 * (author, date, text, anchored passage) from a .docx. Returns a markdown
 * section, or "" when the document carries no review markup.
 */
export async function extractDocxReviewMarkup(
    bytes: Buffer,
): Promise<string> {
    let docXml: string | null = null;
    let commentsXml: string | null = null;
    try {
        const zip = await JSZip.loadAsync(bytes);
        docXml = await zipEntryText(zip, "word/document.xml");
        commentsXml = await zipEntryText(zip, "word/comments.xml");
    } catch {
        return "";
    }
    if (!docXml) return "";

    const lines: string[] = [];

    // Tracked changes -------------------------------------------------------
    const changeLines: string[] = [];
    const changeRe =
        /<w:(ins|del)\s([^>]*)>([\s\S]*?)<\/w:\1>/g;
    let cm: RegExpExecArray | null;
    while ((cm = changeRe.exec(docXml))) {
        const kind = cm[1] === "ins" ? "Insertion" : "Deletion";
        const attrs = cm[2] ?? "";
        const author = attr(attrs, "w:author") ?? "Unknown";
        const date = formatDate(attr(attrs, "w:date"));
        const text = truncate(textOf(cm[3] ?? ""));
        if (!text) continue;
        changeLines.push(`- ${kind} by ${author}${date}: "${text}"`);
        if (changeLines.length >= 200) break;
    }

    // Comments --------------------------------------------------------------
    const commentLines: string[] = [];
    if (commentsXml) {
        // Anchor text: passage between commentRangeStart/End for each id.
        const anchorById = new Map<string, string>();
        const anchorRe =
            /<w:commentRangeStart\s[^>]*w:id="([^"]*)"[^>]*\/>([\s\S]*?)<w:commentRangeEnd\s[^>]*w:id="\1"/g;
        let am: RegExpExecArray | null;
        while ((am = anchorRe.exec(docXml))) {
            anchorById.set(am[1] ?? "", truncate(textOf(am[2] ?? ""), 160));
        }

        const commentRe =
            /<w:comment\s([^>]*)>([\s\S]*?)<\/w:comment>/g;
        let km: RegExpExecArray | null;
        while ((km = commentRe.exec(commentsXml))) {
            const attrs = km[1] ?? "";
            const id = attr(attrs, "w:id") ?? "";
            const author = attr(attrs, "w:author") ?? "Unknown";
            const date = formatDate(attr(attrs, "w:date"));
            const text = truncate(textOf(km[2] ?? ""), 600);
            if (!text) continue;
            const anchor = anchorById.get(id);
            const anchorPart = anchor ? ` (on the text: "${anchor}")` : "";
            commentLines.push(
                `- Comment by ${author}${date}${anchorPart}: "${text}"`,
            );
            if (commentLines.length >= 200) break;
        }
    }

    if (changeLines.length === 0 && commentLines.length === 0) return "";

    lines.push("## Review Markup (tracked changes and comments)");
    lines.push(
        "This document contains Word review markup. The body text above is the accepted view; the raw changes and comment bubbles are:",
    );
    if (changeLines.length > 0) {
        lines.push("", "### Tracked changes", ...changeLines);
    }
    if (commentLines.length > 0) {
        lines.push("", "### Comments", ...commentLines);
    }
    return lines.join("\n");
}

/**
 * Extract PDF annotations (sticky notes, free-text boxes, and markup
 * annotations that carry comment text) as a markdown section, or "" when
 * the PDF has none.
 */
export async function extractPdfAnnotationsMarkup(
    buf: ArrayBuffer,
): Promise<string> {
    try {
        const pdfjsLib = await import(
            "pdfjs-dist/legacy/build/pdf.mjs" as string
        );
        const pdf = await (
            pdfjsLib as unknown as {
                getDocument: (opts: unknown) => {
                    promise: Promise<{
                        numPages: number;
                        getPage: (n: number) => Promise<{
                            getAnnotations: () => Promise<
                                Record<string, unknown>[]
                            >;
                        }>;
                    }>;
                };
            }
        ).getDocument({ data: new Uint8Array(buf) }).promise;

        const lines: string[] = [];
        const pageLimit = Math.min(pdf.numPages, 500);
        for (let i = 1; i <= pageLimit; i++) {
            const page = await pdf.getPage(i);
            const annotations = await page.getAnnotations();
            for (const a of annotations) {
                const subtype =
                    typeof a.subtype === "string" ? a.subtype : "";
                if (subtype === "Link" || subtype === "Widget") continue;
                const contents =
                    (a.contentsObj as { str?: string } | undefined)?.str ??
                    (typeof a.contents === "string" ? a.contents : "");
                const author =
                    (a.titleObj as { str?: string } | undefined)?.str ??
                    (typeof a.title === "string" ? a.title : "");
                const text = truncate(contents ?? "", 600);
                if (!text) continue; // bare highlights carry no note text
                const label = subtype || "Note";
                const by = author ? ` by ${author}` : "";
                lines.push(`- Page ${i} — ${label}${by}: "${text}"`);
                if (lines.length >= 300) break;
            }
            if (lines.length >= 300) break;
        }
        if (lines.length === 0) return "";
        return [
            "## PDF Annotations (comments and notes)",
            "This PDF carries annotation comments:",
            "",
            ...lines,
        ].join("\n");
    } catch {
        return "";
    }
}
