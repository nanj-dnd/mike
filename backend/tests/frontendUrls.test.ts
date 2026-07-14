import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedFrontendOrigins, primaryFrontendUrl } from "../src/lib/frontendUrls";

// CORS silently rejecting a valid second domain (e.g. www vs apex) is hard
// to notice until a real browser hits it, so the comma-separated parsing
// that backs both allowedFrontendOrigins and primaryFrontendUrl is worth
// pinning directly.

function withFrontendUrl(value: string | undefined, fn: () => void) {
    const original = process.env.FRONTEND_URL;
    if (value === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = value;
    try {
        fn();
    } finally {
        if (original === undefined) delete process.env.FRONTEND_URL;
        else process.env.FRONTEND_URL = original;
    }
}

test("defaults to localhost when FRONTEND_URL is unset", () => {
    withFrontendUrl(undefined, () => {
        assert.deepEqual(allowedFrontendOrigins(), ["http://localhost:3000"]);
        assert.equal(primaryFrontendUrl(), "http://localhost:3000");
    });
});

test("a single FRONTEND_URL is both the sole allowed origin and primary", () => {
    withFrontendUrl("https://trygavel.in", () => {
        assert.deepEqual(allowedFrontendOrigins(), ["https://trygavel.in"]);
        assert.equal(primaryFrontendUrl(), "https://trygavel.in");
    });
});

test("comma-separated FRONTEND_URL allows every origin, first is primary", () => {
    withFrontendUrl("https://trygavel.in,https://www.trygavel.in", () => {
        assert.deepEqual(allowedFrontendOrigins(), [
            "https://trygavel.in",
            "https://www.trygavel.in",
        ]);
        assert.equal(primaryFrontendUrl(), "https://trygavel.in");
    });
});

test("tolerates stray whitespace and trailing commas", () => {
    withFrontendUrl(" https://trygavel.in ,  https://www.trygavel.in ,", () => {
        assert.deepEqual(allowedFrontendOrigins(), [
            "https://trygavel.in",
            "https://www.trygavel.in",
        ]);
    });
});

test("blank FRONTEND_URL falls back to the default like unset", () => {
    withFrontendUrl("   ", () => {
        assert.deepEqual(allowedFrontendOrigins(), ["http://localhost:3000"]);
    });
});
