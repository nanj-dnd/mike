import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import { logAudit } from "../lib/auditLog";
import {
    findConflictHits,
    isMissingConflictTables,
    loadPartyRegister,
    normalizePartyName,
    PARTY_SIDES,
    type ConflictQueryParty,
    type PartySide,
} from "../lib/conflicts";

export const conflictsRouter = Router();

const MAX_PARTIES_PER_CHECK = 50;

function parseParties(
    body: unknown,
): { ok: true; parties: ConflictQueryParty[] } | { ok: false; detail: string } {
    const raw = (body as { parties?: unknown })?.parties;
    if (!Array.isArray(raw) || raw.length === 0) {
        return { ok: false, detail: "parties must be a non-empty array" };
    }
    if (raw.length > MAX_PARTIES_PER_CHECK) {
        return {
            ok: false,
            detail: `parties may not exceed ${MAX_PARTIES_PER_CHECK} entries`,
        };
    }
    const parties: ConflictQueryParty[] = [];
    for (const entry of raw) {
        const name =
            typeof (entry as { name?: unknown })?.name === "string"
                ? ((entry as { name: string }).name ?? "").trim()
                : "";
        const side = (entry as { side?: unknown })?.side as PartySide;
        if (!name) {
            return { ok: false, detail: "Every party needs a name" };
        }
        if (name.length > 300) {
            return { ok: false, detail: "Party names are limited to 300 characters" };
        }
        if (!PARTY_SIDES.includes(side)) {
            return {
                ok: false,
                detail: `side must be one of: ${PARTY_SIDES.join(", ")}`,
            };
        }
        parties.push({ name, side });
    }
    return { ok: true, parties };
}

// POST /conflicts/check — run a conflict check; optionally link it to a
// matter, which also saves the party list as that matter's register.
conflictsRouter.post("/check", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const parsed = parseParties(req.body);
    if (!parsed.ok) return void res.status(400).json({ detail: parsed.detail });

    const projectId =
        typeof req.body?.projectId === "string" && req.body.projectId
            ? (req.body.projectId as string)
            : null;

    const db = createServerSupabase();
    try {
        if (projectId) {
            const access = await checkProjectAccess(
                projectId,
                userId,
                userEmail,
                db,
            );
            if (!access.ok) {
                return void res
                    .status(404)
                    .json({ detail: "Matter not found" });
            }
            // Replace the matter's party register with this list.
            await db
                .from("gavel_matter_parties")
                .delete()
                .eq("project_id", projectId);
            const { error: insertError } = await db
                .from("gavel_matter_parties")
                .insert(
                    parsed.parties.map((party) => ({
                        project_id: projectId,
                        user_id: access.project.user_id,
                        name: party.name,
                        normalized_name: normalizePartyName(party.name),
                        side: party.side,
                    })),
                );
            if (insertError) throw insertError;
        }

        const register = await loadPartyRegister(db, userId, projectId);
        const hits = findConflictHits(parsed.parties, register);
        const status = hits.length > 0 ? "flagged" : "clear";

        const { data: checkRow, error: checkError } = await db
            .from("gavel_conflict_checks")
            .insert({
                user_id: userId,
                project_id: projectId,
                parties: parsed.parties,
                hits,
                status,
            })
            .select("id, created_at")
            .single();
        if (checkError) throw checkError;

        logAudit({
            userId,
            action: "conflict.check",
            resourceType: projectId ? "project" : undefined,
            resourceId: projectId ?? undefined,
            metadata: { status, hitCount: hits.length },
            req,
        });
        res.json({
            id: checkRow.id,
            status,
            hits,
            created_at: checkRow.created_at,
        });
    } catch (err) {
        const e = err as { code?: string; message: string };
        if (isMissingConflictTables(e)) {
            return void res.status(503).json({
                detail:
                    "Conflict checking is not set up on this deployment yet.",
            });
        }
        console.error("[conflicts] check failed", e.message);
        res.status(500).json({ detail: "Conflict check failed" });
    }
});

// GET /conflicts/history — the caller's recent checks, newest first.
conflictsRouter.get("/history", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const { data, error } = await db
        .from("gavel_conflict_checks")
        .select("id, project_id, parties, hits, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
    if (error) {
        if (isMissingConflictTables(error))
            return void res.json({ checks: [] });
        return void res.status(500).json({ detail: error.message });
    }
    res.json({ checks: data ?? [] });
});

// GET /conflicts/projects/:projectId/parties — a matter's registered
// parties (prefills the check form when a matter is linked).
conflictsRouter.get(
    "/projects/:projectId/parties",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const { projectId } = req.params;
        const db = createServerSupabase();
        const access = await checkProjectAccess(
            projectId,
            userId,
            userEmail,
            db,
        );
        if (!access.ok)
            return void res.status(404).json({ detail: "Matter not found" });

        const { data, error } = await db
            .from("gavel_matter_parties")
            .select("name, side")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true });
        if (error) {
            if (isMissingConflictTables(error))
                return void res.json({ parties: [] });
            return void res.status(500).json({ detail: error.message });
        }
        res.json({ parties: data ?? [] });
    },
);
