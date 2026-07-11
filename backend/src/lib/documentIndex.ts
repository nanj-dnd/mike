import { createServerSupabase } from "./supabase";
import { downloadFile } from "./storage";
import { extractDocumentMarkdown } from "./documentExtract";
import { loadActiveVersion } from "./documentVersions";
import { getUserApiKeys } from "./userApiKeys";
import type { UserApiKeys } from "./llm";
import {
    embeddingModelForKeys,
    embedTexts,
    toVectorLiteral,
    type EmbeddingModel,
} from "./embeddings";

/**
 * Semantic document index (RAG) on Supabase pgvector.
 *
 * Documents are chunked and embedded on upload (fire-and-forget, on the
 * uploader's own API key) into gavel_document_chunks. The assistant's
 * search_documents tool embeds the query and retrieves the most relevant
 * passages via the gavel_match_chunks RPC, so large matters no longer
 * require stuffing every document into the context window.
 *
 * Self-disabling: if the migration has not been applied yet, indexing and
 * search log one warning and no-op — nothing else breaks.
 */

const CHUNK_TARGET_CHARS = 1500;
const CHUNK_OVERLAP_CHARS = 200;
const MAX_CHUNKS_PER_DOC = 2000;

let indexDisabled = false;

function isMissingTableError(error: {
    code?: string;
    message: string;
}): boolean {
    return (
        error.code === "42P01" ||
        /could not find the (table|function)/i.test(error.message) ||
        /schema cache/i.test(error.message)
    );
}

function disableIndex(context: string) {
    if (!indexDisabled) {
        indexDisabled = true;
        console.warn(
            `[docindex] ${context} — semantic index disabled. Apply supabase/migrations/20260711_02_document_chunks.sql.`,
        );
    }
}

export type DocumentChunk = {
    chunk_index: number;
    page: number | null;
    content: string;
};

/**
 * Split extracted markdown into overlapping chunks on paragraph
 * boundaries, attributing each chunk to the last "## Page N" heading seen
 * before it starts. Exported for tests.
 */
export function chunkMarkdown(markdown: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const text = markdown.trim();
    if (!text) return chunks;

    const paragraphs = text.split(/\n{2,}/);
    let current = "";
    let currentPage: number | null = null;
    let page: number | null = null;

    const flush = () => {
        const content = current.trim();
        if (content) {
            chunks.push({
                chunk_index: chunks.length,
                page: currentPage,
                content,
            });
        }
        // Start the next chunk with trailing overlap for continuity.
        current = current.slice(
            Math.max(0, current.length - CHUNK_OVERLAP_CHARS),
        );
    };

    for (const para of paragraphs) {
        const pageMatch = /^##\s*Page\s+(\d+)\s*$/i.exec(para.trim());
        if (pageMatch) {
            page = Number(pageMatch[1]);
            continue;
        }
        if (current.trim() === "") currentPage = page;
        // A single paragraph larger than the target is split hard.
        if (para.length > CHUNK_TARGET_CHARS * 2) {
            if (current.trim()) flush();
            for (let i = 0; i < para.length; i += CHUNK_TARGET_CHARS) {
                current = para.slice(
                    Math.max(0, i - (i > 0 ? CHUNK_OVERLAP_CHARS : 0)),
                    i + CHUNK_TARGET_CHARS,
                );
                currentPage = page;
                flush();
                current = "";
            }
            continue;
        }
        if (current.length + para.length + 2 > CHUNK_TARGET_CHARS) {
            flush();
        }
        current = current ? `${current}\n\n${para}` : para;
        if (current.trim() !== "" && chunks.length === 0 && currentPage === null) {
            currentPage = page;
        }
    }
    if (current.trim()) {
        flush();
    }
    return chunks.slice(0, MAX_CHUNKS_PER_DOC);
}

/**
 * Index (or re-index) a document's active version for semantic search.
 * Fire-and-forget from upload routes: never throws.
 */
export async function indexDocumentForUser(
    documentId: string,
    userId: string,
): Promise<void> {
    if (indexDisabled) return;
    try {
        const db = createServerSupabase();
        const apiKeys = await getUserApiKeys(userId, db);
        const model = embeddingModelForKeys(apiKeys);
        if (!model) return; // No embedding-capable key; index lazily later.

        const { data: doc } = await db
            .from("documents")
            .select("id, file_type, current_version_id")
            .eq("id", documentId)
            .single();
        if (!doc) return;

        const version = await loadActiveVersion(documentId, db);
        const storagePath = version?.storage_path;
        if (!storagePath || typeof storagePath !== "string") return;

        const buf = await downloadFile(storagePath);
        if (!buf) return;
        const markdown = await extractDocumentMarkdown(
            buf,
            (doc as { file_type?: string | null }).file_type,
        );
        const chunks = chunkMarkdown(markdown);
        if (chunks.length === 0) return;

        const embeddings = await embedTexts(
            chunks.map((c) => c.content),
            model,
            apiKeys,
        );

        // Replace any previous index for this document (one live version).
        const { error: deleteError } = await db
            .from("gavel_document_chunks")
            .delete()
            .eq("document_id", documentId);
        if (deleteError) {
            if (isMissingTableError(deleteError)) {
                disableIndex("gavel_document_chunks table missing");
                return;
            }
            throw deleteError;
        }

        const versionId =
            (version as { id?: string } | null)?.id ??
            (doc as { current_version_id?: string | null })
                .current_version_id ??
            null;
        const rows = chunks.map((c, i) => ({
            document_id: documentId,
            version_id: versionId,
            chunk_index: c.chunk_index,
            page: c.page,
            content: c.content,
            embedding: toVectorLiteral(embeddings[i] ?? []),
            embedding_model: model,
        }));
        // Insert in batches to stay under PostgREST payload limits.
        for (let i = 0; i < rows.length; i += 100) {
            const { error } = await db
                .from("gavel_document_chunks")
                .insert(rows.slice(i, i + 100));
            if (error) throw error;
        }
    } catch (err) {
        console.error(
            `[docindex] indexing failed doc=${documentId}:`,
            err instanceof Error ? err.message : err,
        );
    }
}

export type ChunkMatch = {
    document_id: string;
    chunk_index: number;
    page: number | null;
    content: string;
    similarity: number;
};

export type SearchOutcome = {
    matches: ChunkMatch[];
    /** Document ids in scope that have no index yet. */
    unindexedDocIds: string[];
    /** True when no embedding-capable key is configured. */
    embeddingsUnavailable: boolean;
    indexUnavailable: boolean;
};

/**
 * Semantic search across the given documents. Kicks off detached indexing
 * for any in-scope documents that are not indexed yet and reports them so
 * the caller can say so.
 */
export async function searchDocumentChunks(params: {
    query: string;
    documentIds: string[];
    userId: string;
    apiKeys: UserApiKeys;
    matchCount?: number;
}): Promise<SearchOutcome> {
    const { query, documentIds, userId, apiKeys } = params;
    const matchCount = params.matchCount ?? 12;
    const outcome: SearchOutcome = {
        matches: [],
        unindexedDocIds: [],
        embeddingsUnavailable: false,
        indexUnavailable: indexDisabled,
    };
    if (indexDisabled || documentIds.length === 0) return outcome;

    const model = embeddingModelForKeys(apiKeys);
    if (!model) {
        outcome.embeddingsUnavailable = true;
        return outcome;
    }

    const db = createServerSupabase();
    const { data: indexedRows, error: indexedError } = await db
        .from("gavel_document_chunks")
        .select("document_id, embedding_model")
        .in("document_id", documentIds);
    if (indexedError) {
        if (isMissingTableError(indexedError)) {
            disableIndex("gavel_document_chunks table missing");
            outcome.indexUnavailable = true;
            return outcome;
        }
        throw indexedError;
    }

    const modelsByDoc = new Map<string, EmbeddingModel>();
    for (const row of indexedRows ?? []) {
        modelsByDoc.set(
            row.document_id as string,
            row.embedding_model as EmbeddingModel,
        );
    }
    outcome.unindexedDocIds = documentIds.filter(
        (id) => !modelsByDoc.has(id),
    );
    // Backfill missing docs in the background for the next query.
    for (const docId of outcome.unindexedDocIds) {
        void indexDocumentForUser(docId, userId);
    }

    // Group indexed docs by their embedding model, embed the query once per
    // model, and merge results by similarity.
    const docsByModel = new Map<EmbeddingModel, string[]>();
    for (const [docId, docModel] of modelsByDoc) {
        const list = docsByModel.get(docModel) ?? [];
        list.push(docId);
        docsByModel.set(docModel, list);
    }

    const allMatches: ChunkMatch[] = [];
    for (const [docModel, docIds] of docsByModel) {
        const [queryEmbedding] = await embedTexts([query], docModel, apiKeys);
        if (!queryEmbedding) continue;
        const { data, error } = await db.rpc("gavel_match_chunks", {
            query_embedding: toVectorLiteral(queryEmbedding),
            doc_ids: docIds,
            match_count: matchCount,
        });
        if (error) {
            if (isMissingTableError(error)) {
                disableIndex("gavel_match_chunks function missing");
                outcome.indexUnavailable = true;
                return outcome;
            }
            throw error;
        }
        for (const row of (data ?? []) as ChunkMatch[]) allMatches.push(row);
    }
    allMatches.sort((a, b) => b.similarity - a.similarity);
    outcome.matches = allMatches.slice(0, matchCount);
    return outcome;
}
