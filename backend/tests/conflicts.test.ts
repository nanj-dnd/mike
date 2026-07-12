import { test } from "node:test";
import assert from "node:assert/strict";
import {
    findConflictHits,
    normalizePartyName,
    partyNamesMatch,
    type StoredParty,
} from "../src/lib/conflicts";

// Conflict matching must be deterministic and explainable, so the whole
// decision path is pure functions. These tests pin the normalization and
// matching rules the register search depends on.

test("normalizePartyName strips corporate suffixes and Indian honorifics", () => {
    assert.equal(normalizePartyName("M/s Sharma & Co."), "sharma");
    assert.equal(
        normalizePartyName("Sharma Steel Pvt. Ltd."),
        "sharma steel",
    );
    assert.equal(normalizePartyName("Shri Rajesh Kumar"), "rajesh kumar");
    assert.equal(
        normalizePartyName("The Oberoi Group of Companies"),
        "oberoi companies",
    );
});

test("normalizePartyName is punctuation- and case-insensitive", () => {
    assert.equal(
        normalizePartyName("TATA  CONSULTANCY   SERVICES"),
        normalizePartyName("Tata Consultancy Services"),
    );
    assert.equal(
        normalizePartyName("Larsen & Toubro"),
        normalizePartyName("larsen toubro"),
    );
});

test("partyNamesMatch: exact, subset, and non-matches", () => {
    const n = normalizePartyName;
    assert.equal(partyNamesMatch(n("Sharma Steel"), n("Sharma Steel")), "exact");
    // Suffix-only differences normalize away to an exact match.
    assert.equal(
        partyNamesMatch(n("Sharma Steel Pvt Ltd"), n("Sharma Steel")),
        "exact",
    );
    // Token subset: a shorter name contained in a longer one is a hit.
    assert.equal(
        partyNamesMatch(n("Sharma Steel"), n("Sharma Steel Industries")),
        "partial",
    );
    assert.equal(partyNamesMatch(n("M/s Sharma & Co"), n("Sharma Steel")), "partial");
    // Different names must not collide.
    assert.equal(partyNamesMatch(n("Sharma Steel"), n("Gupta Textiles")), null);
    // Empty after normalization never matches.
    assert.equal(partyNamesMatch(n("Pvt Ltd"), n("Sharma Steel")), null);
});

const register: StoredParty[] = [
    {
        projectId: "p1",
        projectName: "Sharma Steel v Gupta Textiles",
        name: "Sharma Steel Pvt Ltd",
        normalizedName: normalizePartyName("Sharma Steel Pvt Ltd"),
        side: "client",
    },
    {
        projectId: "p1",
        projectName: "Sharma Steel v Gupta Textiles",
        name: "Gupta Textiles",
        normalizedName: normalizePartyName("Gupta Textiles"),
        side: "opposing",
    },
];

test("findConflictHits flags acting against an existing client as adverse", () => {
    const hits = findConflictHits(
        [{ name: "Sharma Steel", side: "opposing" }],
        register,
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "adverse");
    assert.equal(hits[0].projectId, "p1");
    assert.equal(hits[0].matchedSide, "client");
});

test("findConflictHits marks same-side overlap as related, not adverse", () => {
    const hits = findConflictHits(
        [{ name: "Sharma Steel", side: "client" }],
        register,
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "related");
});

test("findConflictHits returns no hits for unrelated parties", () => {
    const hits = findConflictHits(
        [{ name: "Mehta Pharma", side: "client" }],
        register,
    );
    assert.equal(hits.length, 0);
});

test("findConflictHits orders adverse hits before related ones", () => {
    const hits = findConflictHits(
        [
            { name: "Gupta Textiles", side: "opposing" },
            { name: "Sharma Steel", side: "opposing" },
        ],
        register,
    );
    assert.equal(hits.length, 2);
    assert.equal(hits[0].severity, "adverse");
    assert.equal(hits[1].severity, "related");
});
