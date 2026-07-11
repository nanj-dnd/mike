import type { Provider } from "./types";

// ---------------------------------------------------------------------------
// Canonical model IDs
// ---------------------------------------------------------------------------
// Main-chat tier (top-end) — user picks one of these per message.
export const CLAUDE_MAIN_MODELS = [
    "claude-fable-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
] as const;
export const GEMINI_MAIN_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
] as const;
export const OPENAI_MAIN_MODELS = ["gpt-5.5", "gpt-5.4"] as const;

// Mid-tier (used for tabular review) — user picks one in account settings.
export const CLAUDE_MID_MODELS = ["claude-sonnet-4-6"] as const;
export const GEMINI_MID_MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview"] as const;
export const OPENAI_MID_MODELS = ["gpt-5.4"] as const;

// Low-tier (used for title generation, lightweight extractions) — user picks
// one in account settings.
export const CLAUDE_LOW_MODELS = ["claude-haiku-4-5"] as const;
export const GEMINI_LOW_MODELS = ["gemini-3.1-flash-lite-preview"] as const;
export const OPENAI_LOW_MODELS = ["gpt-5.4-lite"] as const;

export const DEFAULT_MAIN_MODEL = "gemini-3-flash-preview";
export const DEFAULT_TITLE_MODEL = "gemini-3.1-flash-lite-preview";
export const DEFAULT_TABULAR_MODEL = "gemini-3-flash-preview";

const ALL_MODELS = new Set<string>([
    ...CLAUDE_MAIN_MODELS,
    ...GEMINI_MAIN_MODELS,
    ...OPENAI_MAIN_MODELS,
    ...CLAUDE_MID_MODELS,
    ...GEMINI_MID_MODELS,
    ...OPENAI_MID_MODELS,
    ...CLAUDE_LOW_MODELS,
    ...GEMINI_LOW_MODELS,
    ...OPENAI_LOW_MODELS,
]);

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

export function providerForModel(model: string): Provider {
    if (model.startsWith("claude")) return "claude";
    if (model.startsWith("gemini")) return "gemini";
    if (model.startsWith("gpt-")) return "openai";
    throw new Error(`Unknown model id: ${model}`);
}

export function resolveModel(id: string | null | undefined, fallback: string): string {
    if (id && ALL_MODELS.has(id)) return id;
    return fallback;
}

// ---------------------------------------------------------------------------
// Key-aware default models
// ---------------------------------------------------------------------------
// When the user hasn't explicitly picked a model for a task (title generation,
// tabular review), default to the first provider in this order that they have
// an API key for. An explicit pick in Account → Model Preferences always wins
// over this order.
export const PROVIDER_PREFERENCE: readonly Provider[] = [
    "gemini",
    "openai",
    "claude",
];

export type ModelTier = "low" | "mid";

const TIER_DEFAULT_BY_PROVIDER: Record<ModelTier, Record<Provider, string>> = {
    low: {
        gemini: DEFAULT_TITLE_MODEL,
        openai: OPENAI_LOW_MODELS[0],
        claude: CLAUDE_LOW_MODELS[0],
    },
    mid: {
        gemini: DEFAULT_TABULAR_MODEL,
        openai: OPENAI_MID_MODELS[0],
        claude: CLAUDE_MID_MODELS[0],
    },
};

/**
 * Pick the default model of `tier` for the first provider in
 * PROVIDER_PREFERENCE that the user has a key for. Accepts either stored key
 * strings (UserApiKeys) or boolean status flags (ApiKeyStatus). With no user
 * keys at all, falls back to Gemini (the dev-mode env fallback).
 */
export function defaultModelForKeys(
    tier: ModelTier,
    apiKeys: Partial<Record<Provider, string | boolean | null>>,
): string {
    for (const provider of PROVIDER_PREFERENCE) {
        const key = apiKeys[provider];
        const hasKey = typeof key === "string" ? !!key.trim() : key === true;
        if (hasKey) return TIER_DEFAULT_BY_PROVIDER[tier][provider];
    }
    return TIER_DEFAULT_BY_PROVIDER[tier].gemini;
}

export function providerDisplayName(provider: Provider): string {
    if (provider === "claude") return "Anthropic";
    if (provider === "openai") return "OpenAI";
    return "Gemini";
}

/**
 * BYO-key guard: returns a structured `missing_api_key` payload when the
 * user has no API key stored for the provider that `model` resolves to,
 * or null when the request may proceed. Every user must bring their own
 * LLM key — there is no platform fallback.
 */
export function missingModelApiKey(
    model: string,
    apiKeys: { [key in Provider]?: string | null },
): { provider: Provider; model: string; detail: string } | null {
    const provider = providerForModel(model);
    if (apiKeys[provider]?.trim()) return null;
    return {
        provider,
        model,
        detail: `${providerDisplayName(provider)} API key is required to use ${model}. Add your own API key in Account → API Keys.`,
    };
}
