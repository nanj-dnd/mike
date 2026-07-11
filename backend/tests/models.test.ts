import { test } from "node:test";
import assert from "node:assert/strict";
import {
    missingModelApiKey,
    providerForModel,
    providerDisplayName,
    resolveModel,
    DEFAULT_MAIN_MODEL,
} from "../src/lib/llm/models";

test("providerForModel maps model prefixes to providers", () => {
    assert.equal(providerForModel("claude-fable-5"), "claude");
    assert.equal(providerForModel("gemini-3-flash-preview"), "gemini");
    assert.equal(providerForModel("gpt-5.2"), "openai");
    assert.throws(() => providerForModel("llama-3"));
});

test("resolveModel falls back for unknown ids", () => {
    assert.equal(resolveModel("not-a-model", DEFAULT_MAIN_MODEL), DEFAULT_MAIN_MODEL);
    assert.equal(resolveModel(null, DEFAULT_MAIN_MODEL), DEFAULT_MAIN_MODEL);
    assert.equal(resolveModel(undefined, "x"), "x");
});

test("missingModelApiKey enforces bring-your-own keys", () => {
    // No key stored → structured missing_api_key payload
    const missing = missingModelApiKey(DEFAULT_MAIN_MODEL, {});
    assert.ok(missing);
    assert.equal(missing!.provider, "gemini");
    assert.equal(missing!.model, DEFAULT_MAIN_MODEL);
    assert.match(missing!.detail, /API key is required/);

    // Blank key does not count
    assert.ok(missingModelApiKey(DEFAULT_MAIN_MODEL, { gemini: "  " }));

    // User key present → request may proceed
    assert.equal(
        missingModelApiKey(DEFAULT_MAIN_MODEL, { gemini: "user-key" }),
        null,
    );
    // A key for the wrong provider does not satisfy the check
    assert.ok(missingModelApiKey(DEFAULT_MAIN_MODEL, { claude: "user-key" }));
});

test("providerDisplayName labels providers", () => {
    assert.equal(providerDisplayName("claude"), "Anthropic");
    assert.equal(providerDisplayName("openai"), "OpenAI");
    assert.equal(providerDisplayName("gemini"), "Gemini");
});
