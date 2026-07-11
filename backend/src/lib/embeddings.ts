import type { UserApiKeys } from "./llm";

/**
 * Text embeddings for the semantic document index.
 *
 * Bring-your-own-key like everything else: embeddings run on the user's
 * Gemini key when present, else their OpenAI key. Both providers are
 * pinned to 768 dimensions (OpenAI via matryoshka truncation) so chunks
 * from either share the one vector(768) column; the model name is stored
 * per chunk and queries always embed with the same model as the chunks
 * they search.
 */

export const EMBEDDING_DIMS = 768;
export const GEMINI_EMBEDDING_MODEL = "text-embedding-004";
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

export type EmbeddingModel =
    | typeof GEMINI_EMBEDDING_MODEL
    | typeof OPENAI_EMBEDDING_MODEL;

/** Pick the embedding model the user's keys support, or null if none. */
export function embeddingModelForKeys(
    apiKeys: UserApiKeys,
): EmbeddingModel | null {
    if (apiKeys.gemini?.trim()) return GEMINI_EMBEDDING_MODEL;
    if (apiKeys.openai?.trim()) return OPENAI_EMBEDDING_MODEL;
    return null;
}

const GEMINI_BATCH_LIMIT = 100;
const OPENAI_BATCH_LIMIT = 512;

export async function embedTexts(
    texts: string[],
    model: EmbeddingModel,
    apiKeys: UserApiKeys,
): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (model === GEMINI_EMBEDDING_MODEL) {
        return embedGemini(texts, apiKeys.gemini?.trim() ?? "");
    }
    return embedOpenAI(texts, apiKeys.openai?.trim() ?? "");
}

async function embedGemini(
    texts: string[],
    apiKey: string,
): Promise<number[][]> {
    if (!apiKey) throw new Error("Gemini API key required for embeddings.");
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += GEMINI_BATCH_LIMIT) {
        const batch = texts.slice(i, i + GEMINI_BATCH_LIMIT);
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requests: batch.map((text) => ({
                        model: `models/${GEMINI_EMBEDDING_MODEL}`,
                        content: { parts: [{ text }] },
                    })),
                }),
            },
        );
        if (!res.ok) {
            throw new Error(
                `Gemini embeddings failed (${res.status} ${res.statusText}).`,
            );
        }
        const json = (await res.json()) as {
            embeddings?: { values?: number[] }[];
        };
        const embeddings = json.embeddings ?? [];
        if (embeddings.length !== batch.length) {
            throw new Error("Gemini embeddings returned unexpected count.");
        }
        for (const e of embeddings) out.push(e.values ?? []);
    }
    return out;
}

async function embedOpenAI(
    texts: string[],
    apiKey: string,
): Promise<number[][]> {
    if (!apiKey) throw new Error("OpenAI API key required for embeddings.");
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += OPENAI_BATCH_LIMIT) {
        const batch = texts.slice(i, i + OPENAI_BATCH_LIMIT);
        const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: OPENAI_EMBEDDING_MODEL,
                input: batch,
                dimensions: EMBEDDING_DIMS,
            }),
        });
        if (!res.ok) {
            throw new Error(
                `OpenAI embeddings failed (${res.status} ${res.statusText}).`,
            );
        }
        const json = (await res.json()) as {
            data?: { index: number; embedding: number[] }[];
        };
        const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
        if (data.length !== batch.length) {
            throw new Error("OpenAI embeddings returned unexpected count.");
        }
        for (const d of data) out.push(d.embedding);
    }
    return out;
}

/** pgvector literal form for PostgREST/RPC parameters. */
export function toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
}
