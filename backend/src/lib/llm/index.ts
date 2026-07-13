import { streamClaude, completeClaudeText, completeClaudeTextResult } from "./claude";
import { streamGemini, completeGeminiText, completeGeminiTextResult } from "./gemini";
import { streamOpenAI, completeOpenAIText, completeOpenAITextResult } from "./openai";
import { providerForModel } from "./models";
import type { LlmUsage, StreamChatParams, StreamChatResult, UserApiKeys } from "./types";

export * from "./types";
export * from "./models";

export async function streamChatWithTools(
    params: StreamChatParams,
): Promise<StreamChatResult> {
    const provider = providerForModel(params.model);
    if (provider === "claude") return streamClaude(params);
    if (provider === "openai") return streamOpenAI(params);
    return streamGemini(params);
}

export async function completeText(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    apiKeys?: UserApiKeys;
}): Promise<string> {
    const provider = providerForModel(params.model);
    if (provider === "claude") return completeClaudeText(params);
    if (provider === "openai") return completeOpenAIText(params);
    return completeGeminiText(params);
}

/**
 * completeText plus token usage (when the provider reports it). Used by
 * the workflow engine to record per-node cost.
 */
export async function completeTextResult(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    apiKeys?: UserApiKeys;
}): Promise<{ text: string; usage: LlmUsage | null }> {
    const provider = providerForModel(params.model);
    if (provider === "claude") return completeClaudeTextResult(params);
    if (provider === "openai") return completeOpenAITextResult(params);
    return completeGeminiTextResult(params);
}
