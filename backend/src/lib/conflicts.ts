import { createServerSupabase } from "./supabase";

/**
 * Conflict-of-interest checking.
 *
 * Matching is deliberately deterministic (normalization + token rules,
 * no LLM): a conflict system must give the same answer every time and be
 * explainable in a professional-responsibility review. It also errs
 * toward recall — a false positive costs a human a glance, a false
 * negative is malpractice — so partial (token-subset) matches are
 * reported as hits alongside exact ones.
 */

export type PartySide = "client" | "opposing" | "other";

export interface ConflictQueryParty {
    name: string;
    side: PartySide;
}

export interface StoredParty {
    projectId: string;
    projectName: string;
    name: string;
    normalizedName: string;
    side: PartySide;
}

export interface ConflictHit {
    queryName: string;
    querySide: PartySide;
    matchedName: string;
    matchedSide: PartySide;
    projectId: string;
    projectName: string;
    match: "exact" | "partial";
    /**
     * adverse: the same name appears on opposite sides of the table
     * (client in one matter, opposing in another) — the classic conflict.
     * related: same name, compatible sides — still surfaced so the firm
     * can judge commercial/positional conflicts.
     */
    severity: "adverse" | "related";
}

export const PARTY_SIDES: PartySide[] = ["client", "opposing", "other"];

/**
 * Words that carry no identity: corporate suffixes and honorifics common
 * in Indian party names (M/s Sharma & Co. and Sharma Associates should
 * collide).
 */
const NOISE_WORDS = new Set([
    "the",
    "and",
    "of",
    "m/s",
    "ms",
    "messrs",
    "mr",
    "mrs",
    "shri",
    "smt",
    "dr",
    "pvt",
    "private",
    "ltd",
    "limited",
    "llp",
    "llc",
    "inc",
    "incorporated",
    "co",
    "company",
    "corp",
    "corporation",
    "associates",
    "group",
    "india",
]);

export function normalizePartyName(name: string): string {
    return name
        .toLowerCase()
        .replace(/m\/s\.?/g, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .filter((token) => token && !NOISE_WORDS.has(token))
        .join(" ");
}

function tokens(normalized: string): string[] {
    return normalized ? normalized.split(" ") : [];
}

/**
 * Two normalized names match when they are identical, or when every
 * token of one appears in the other (subset match — "sharma steel" hits
 * "sharma steel industries"). Single-letter tokens are ignored on the
 * subset side so bare initials can't produce noise.
 */
export function partyNamesMatch(
    a: string,
    b: string,
): "exact" | "partial" | null {
    if (!a || !b) return null;
    if (a === b) return "exact";
    const ta = tokens(a);
    const tb = tokens(b);
    const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    const significant = shorter.filter((t) => t.length >= 2);
    if (significant.length === 0) return null;
    const longerSet = new Set(longer);
    return significant.every((t) => longerSet.has(t)) ? "partial" : null;
}

function severityFor(a: PartySide, b: PartySide): "adverse" | "related" {
    const adverse =
        (a === "client" && b === "opposing") ||
        (a === "opposing" && b === "client");
    return adverse ? "adverse" : "related";
}

/**
 * Pure core of the check: compare a proposed party list against the
 * stored register. Exposed separately so the matching behaviour is unit
 * testable without a database.
 */
export function findConflictHits(
    queryParties: ConflictQueryParty[],
    storedParties: StoredParty[],
): ConflictHit[] {
    const hits: ConflictHit[] = [];
    for (const query of queryParties) {
        const queryNormalized = normalizePartyName(query.name);
        if (!queryNormalized) continue;
        for (const stored of storedParties) {
            const match = partyNamesMatch(
                queryNormalized,
                stored.normalizedName,
            );
            if (!match) continue;
            hits.push({
                queryName: query.name,
                querySide: query.side,
                matchedName: stored.name,
                matchedSide: stored.side,
                projectId: stored.projectId,
                projectName: stored.projectName,
                match,
                severity: severityFor(query.side, stored.side),
            });
        }
    }
    // Adverse first, exact before partial, so the list reads worst-first.
    return hits.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "adverse" ? -1 : 1;
        if (a.match !== b.match) return a.match === "exact" ? -1 : 1;
        return 0;
    });
}

type Db = ReturnType<typeof createServerSupabase>;

/**
 * The register a check searches: parties from every matter owned by the
 * caller or by an active member of any organization the caller belongs
 * to. `excludeProjectId` keeps a matter's own freshly-saved parties from
 * matching themselves.
 */
export async function loadPartyRegister(
    db: Db,
    userId: string,
    excludeProjectId?: string | null,
): Promise<StoredParty[]> {
    const scopeUserIds = new Set<string>([userId]);
    const { data: myMemberships } = await db
        .from("gavel_organization_members")
        .select("org_id")
        .eq("user_id", userId)
        .eq("status", "active");
    const orgIds = [
        ...new Set((myMemberships ?? []).map((m) => m.org_id as string)),
    ];
    if (orgIds.length > 0) {
        const { data: colleagues } = await db
            .from("gavel_organization_members")
            .select("user_id")
            .in("org_id", orgIds)
            .eq("status", "active");
        for (const member of colleagues ?? []) {
            if (member.user_id) scopeUserIds.add(member.user_id as string);
        }
    }

    let query = db
        .from("gavel_matter_parties")
        .select("project_id, name, normalized_name, side")
        .in("user_id", [...scopeUserIds])
        .limit(5000);
    if (excludeProjectId) query = query.neq("project_id", excludeProjectId);
    const { data: partyRows, error } = await query;
    if (error) throw error;

    const rows = (partyRows ?? []) as {
        project_id: string;
        name: string;
        normalized_name: string;
        side: PartySide;
    }[];
    if (rows.length === 0) return [];

    const projectIds = [...new Set(rows.map((r) => r.project_id))];
    const { data: projects } = await db
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
    const nameById = new Map(
        ((projects ?? []) as { id: string; name: string }[]).map((p) => [
            p.id,
            p.name,
        ]),
    );

    return rows.map((row) => ({
        projectId: row.project_id,
        projectName: nameById.get(row.project_id) ?? "Untitled matter",
        name: row.name,
        normalizedName: row.normalized_name,
        side: row.side,
    }));
}

export function isMissingConflictTables(error: {
    code?: string;
    message: string;
}): boolean {
    return (
        error.code === "42P01" ||
        /could not find the table/i.test(error.message)
    );
}
