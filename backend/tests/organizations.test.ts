import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail } from "../src/lib/userLookup";

// The organizations router's admin-gating and last-admin protections are
// exercised through Supabase RPC calls, so full integration tests need a
// live database. These unit tests cover the pure logic that is safe to
// verify without one: email normalization used for invite matching, which
// is the basis for how an 'invited' membership silently activates the
// first time the invited person opens Account -> Organization.

test("normalizeEmail lowercases and trims for invite matching", () => {
    assert.equal(normalizeEmail("  Anita.Desai@Firm.COM "), "anita.desai@firm.com");
    assert.equal(normalizeEmail(""), "");
    assert.equal(normalizeEmail(undefined), "");
    assert.equal(normalizeEmail(123), "");
});

test("normalizeEmail is stable for repeated invites of the same address", () => {
    // Two invites typed with different casing/whitespace must collide on
    // the same (org_id, email) unique constraint, not create duplicates.
    assert.equal(
        normalizeEmail("Rahul@Firm.com"),
        normalizeEmail(" rahul@firm.com "),
    );
});
