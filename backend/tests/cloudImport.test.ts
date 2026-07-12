import { test } from "node:test";
import assert from "node:assert/strict";
import {
    importTarget,
    signOAuthState,
    verifyOAuthState,
} from "../src/lib/cloudImport";

process.env.USER_API_KEYS_ENCRYPTION_SECRET ??= "test-secret-for-state";

// OAuth state is a signed, self-contained token (no server session), so
// the callback's only defenses are the signature and TTL checks pinned
// here. importTarget decides what a cloud listing exposes for import.

test("OAuth state round-trips through sign/verify", () => {
    const state = signOAuthState({ userId: "u1", provider: "google_drive" });
    const verified = verifyOAuthState(state);
    assert.equal(verified.userId, "u1");
    assert.equal(verified.provider, "google_drive");
});

test("tampered OAuth state is rejected", () => {
    const state = signOAuthState({ userId: "u1", provider: "onedrive" });
    const [body, sig] = state.split(".");
    const tamperedBody = Buffer.from(
        JSON.stringify({
            ...JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
            userId: "attacker",
        }),
    ).toString("base64url");
    assert.throws(() => verifyOAuthState(`${tamperedBody}.${sig}`), {
        message: /signature mismatch/,
    });
    assert.throws(() => verifyOAuthState("not-a-state"), {
        message: /Invalid OAuth state/,
    });
});

test("importTarget passes through allowed extensions unchanged", () => {
    assert.deepEqual(importTarget("Lease Deed.pdf", "application/pdf"), {
        importName: "Lease Deed.pdf",
        exportedAs: null,
    });
    assert.deepEqual(importTarget("SHA.docx", null), {
        importName: "SHA.docx",
        exportedAs: null,
    });
});

test("importTarget maps Google-native files to Office exports", () => {
    assert.deepEqual(
        importTarget("Board Minutes", "application/vnd.google-apps.document"),
        { importName: "Board Minutes.docx", exportedAs: "docx" },
    );
    assert.deepEqual(
        importTarget("Cap Table", "application/vnd.google-apps.spreadsheet"),
        { importName: "Cap Table.xlsx", exportedAs: "xlsx" },
    );
});

test("importTarget rejects non-importable types", () => {
    assert.equal(importTarget("photo.png", "image/png"), null);
    assert.equal(importTarget("archive.zip", null), null);
    assert.equal(importTarget("no-extension", null), null);
});
