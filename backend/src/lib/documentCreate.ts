import { createServerSupabase } from "./supabase";
import { storageKey, uploadFile } from "./storage";
import { docxToPdf, convertedPdfKey } from "./convert";
import { indexDocumentForUser } from "./documentIndex";
import {
    ALLOWED_DOCUMENT_TYPES,
    ALLOWED_DOCUMENT_TYPES_LABEL,
    contentTypeForDocumentType,
    shouldConvertToPdf,
} from "./documentTypes";

/**
 * Server-side document creation from raw bytes: the same pipeline as a
 * browser upload (R2 storage → Office→PDF display rendition → V1
 * version row → semantic indexing), for callers that fetched the bytes
 * themselves — cloud import from Drive/OneDrive/URL. The two multer
 * upload routes keep their own request/response handling and can be
 * folded onto this helper later.
 */

type Db = ReturnType<typeof createServerSupabase>;

export class DocumentCreateError extends Error {
    status: number;
    constructor(message: string, status = 500) {
        super(message);
        this.name = "DocumentCreateError";
        this.status = status;
    }
}

export async function createDocumentFromBuffer(
    db: Db,
    options: {
        userId: string;
        projectId: string | null;
        filename: string;
        content: Buffer;
    },
): Promise<Record<string, unknown>> {
    const { userId, projectId, filename, content } = options;
    const suffix = filename.includes(".")
        ? filename.split(".").pop()!.toLowerCase()
        : "";
    if (!ALLOWED_DOCUMENT_TYPES.has(suffix)) {
        throw new DocumentCreateError(
            `Unsupported file type: ${suffix || "(none)"}. Allowed: ${ALLOWED_DOCUMENT_TYPES_LABEL}`,
            400,
        );
    }

    const { data: doc, error: insertErr } = await db
        .from("documents")
        .insert({
            project_id: projectId,
            user_id: userId,
            status: "processing",
        })
        .select("*")
        .single();
    if (insertErr || !doc) {
        console.error("[document-create] failed to create document row", {
            userId,
            projectId,
            filename,
            error: insertErr,
        });
        throw new DocumentCreateError("Failed to create document record");
    }

    try {
        const docId = doc.id as string;
        const key = storageKey(userId, docId, filename);
        const rawBuf = content.buffer.slice(
            content.byteOffset,
            content.byteOffset + content.byteLength,
        ) as ArrayBuffer;
        await uploadFile(key, rawBuf, contentTypeForDocumentType(suffix));

        const pageCount = suffix === "pdf" ? await countPdfPages(rawBuf) : null;

        let pdfStoragePath: string | null = null;
        if (shouldConvertToPdf(suffix)) {
            try {
                const pdfBuf = await docxToPdf(content);
                const pdfKey = convertedPdfKey(userId, docId);
                await uploadFile(
                    pdfKey,
                    pdfBuf.buffer.slice(
                        pdfBuf.byteOffset,
                        pdfBuf.byteOffset + pdfBuf.byteLength,
                    ) as ArrayBuffer,
                    "application/pdf",
                );
                pdfStoragePath = pdfKey;
            } catch (err) {
                console.error(
                    `[document-create] Office→PDF conversion failed for ${filename}:`,
                    err,
                );
            }
        } else if (suffix === "pdf") {
            pdfStoragePath = key;
        }

        const { data: versionRow, error: verErr } = await db
            .from("document_versions")
            .insert({
                document_id: docId,
                storage_path: key,
                pdf_storage_path: pdfStoragePath,
                source: "upload",
                version_number: 1,
                filename,
                file_type: suffix,
                size_bytes: content.byteLength,
                page_count: pageCount,
            })
            .select("id")
            .single();
        if (verErr || !versionRow) {
            throw new Error(
                `Failed to record upload version: ${verErr?.message ?? "unknown"}`,
            );
        }

        await db
            .from("documents")
            .update({
                current_version_id: versionRow.id,
                status: "ready",
                updated_at: new Date().toISOString(),
            })
            .eq("id", docId);

        const { data: updated } = await db
            .from("documents")
            .select("*")
            .eq("id", docId)
            .single();
        void indexDocumentForUser(docId, userId);
        return {
            ...(updated ?? { id: docId }),
            filename,
            storage_path: key,
            pdf_storage_path: pdfStoragePath,
            file_type: suffix,
            size_bytes: content.byteLength,
            page_count: pageCount,
            active_version_number: 1,
        };
    } catch (err) {
        await db.from("documents").update({ status: "error" }).eq("id", doc.id);
        if (err instanceof DocumentCreateError) throw err;
        throw new DocumentCreateError(
            `Document processing failed: ${String(err)}`,
        );
    }
}

async function countPdfPages(buf: ArrayBuffer): Promise<number | null> {
    try {
        const pdfjsLib = await import(
            "pdfjs-dist/legacy/build/pdf.mjs" as string
        );
        const pdf = await (
            pdfjsLib as unknown as {
                getDocument: (opts: unknown) => {
                    promise: Promise<{ numPages: number }>;
                };
            }
        ).getDocument({ data: new Uint8Array(buf) }).promise;
        return pdf.numPages;
    } catch {
        return null;
    }
}
