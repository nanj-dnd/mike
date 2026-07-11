import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/lib/chat/prompts";

test("system prompt is India-first", () => {
    const prompt = buildSystemPrompt(false, false);
    assert.match(prompt, /You are Gavel/);
    assert.match(prompt, /primary jurisdiction is India/);
    assert.match(prompt, /Bharatiya Nyaya Sanhita/);
    assert.match(prompt, /SCC/);
    assert.match(prompt, /lakh\/crore/);
    // No stale branding
    assert.doesNotMatch(prompt, /You are Mike/);
});

test("US research instructions are spliced in only when opted in", () => {
    const withUs = buildSystemPrompt(true, false);
    const withoutUs = buildSystemPrompt(false, false);
    assert.match(withUs, /US CASE LAW RESEARCH/);
    assert.doesNotMatch(withoutUs, /US CASE LAW RESEARCH/);
});

test("Indian Kanoon research instructions gate on the flag", () => {
    const withIndia = buildSystemPrompt(false, true);
    const withoutIndia = buildSystemPrompt(false, false);
    assert.match(withIndia, /INDIAN CASE LAW RESEARCH/);
    assert.match(withIndia, /indiankanoon_search/);
    assert.doesNotMatch(withoutIndia, /INDIAN CASE LAW RESEARCH/);
});
