import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown } from "../src/lib/documentIndex";

test("chunkMarkdown returns nothing for empty input", () => {
    assert.deepEqual(chunkMarkdown(""), []);
    assert.deepEqual(chunkMarkdown("   \n\n  "), []);
});

test("chunkMarkdown keeps a short document as one chunk", () => {
    const chunks = chunkMarkdown("A short agreement.\n\nWith two paragraphs.");
    assert.equal(chunks.length, 1);
    assert.match(chunks[0]!.content, /short agreement/);
    assert.match(chunks[0]!.content, /two paragraphs/);
    assert.equal(chunks[0]!.chunk_index, 0);
});

test("chunkMarkdown splits long documents and numbers chunks sequentially", () => {
    const para = "This clause governs the obligations of the parties. ".repeat(
        10,
    );
    const doc = Array.from({ length: 12 }, () => para).join("\n\n");
    const chunks = chunkMarkdown(doc);
    assert.ok(chunks.length > 1, "expected multiple chunks");
    chunks.forEach((c, i) => assert.equal(c.chunk_index, i));
    // Every chunk is bounded (target + tolerance for overlap carry-over)
    for (const c of chunks) {
        assert.ok(
            c.content.length <= 2200,
            `chunk too large: ${c.content.length}`,
        );
    }
});

test("chunkMarkdown attributes chunks to page headings", () => {
    const doc = [
        "## Page 1",
        "First page content about parties and recitals.",
        "## Page 2",
        "Second page content about payment and GST.",
    ].join("\n\n");
    const chunks = chunkMarkdown(doc);
    assert.ok(chunks.length >= 1);
    const pageOf = (needle: string) =>
        chunks.find((c) => c.content.includes(needle))?.page;
    assert.equal(pageOf("recitals"), 1);
    // Page headings themselves are not emitted as content
    for (const c of chunks) {
        assert.doesNotMatch(c.content, /^## Page \d+$/m);
    }
});

test("chunkMarkdown hard-splits a single oversized paragraph", () => {
    const huge = "indemnity ".repeat(800); // ~8000 chars, no paragraph breaks
    const chunks = chunkMarkdown(huge);
    assert.ok(chunks.length >= 3, `expected several chunks, got ${chunks.length}`);
    for (const c of chunks) {
        assert.ok(c.content.length <= 2200);
    }
});
