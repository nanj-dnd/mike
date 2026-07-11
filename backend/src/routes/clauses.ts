import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { logAudit } from "../lib/auditLog";

/**
 * Firm clause library (precedent bank): approved clause language with
 * drafting guidance. User-scoped in v1. The assistant reads it through
 * the search_clause_library chat tool; this router is the management CRUD
 * behind Account-facing UI.
 */
export const clausesRouter = Router();

function isMissingTable(error: { code?: string; message: string }): boolean {
    return (
        error.code === "42P01" ||
        /could not find the table/i.test(error.message)
    );
}

const MAX_BODY = 20_000;
const MAX_TITLE = 200;

function cleanText(value: unknown, max: number): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// GET /clauses?q=term — list (optionally filtered) clauses for the user.
clausesRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const db = createServerSupabase();

    let query = db
        .from("gavel_clauses")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(500);
    if (q) {
        const escaped = q.replace(/[%_,]/g, " ").trim();
        if (escaped) {
            query = query.or(
                `title.ilike.%${escaped}%,body.ilike.%${escaped}%,category.ilike.%${escaped}%`,
            );
        }
    }
    const { data, error } = await query;
    if (error) {
        if (isMissingTable(error)) return void res.json({ clauses: [] });
        return void res.status(500).json({ detail: error.message });
    }
    res.json({ clauses: data ?? [] });
});

// POST /clauses — create a clause.
clausesRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const title = cleanText(req.body?.title, MAX_TITLE);
    const body = cleanText(req.body?.body, MAX_BODY);
    const category = cleanText(req.body?.category, 100) || null;
    const guidance = cleanText(req.body?.guidance, 5000) || null;
    if (!title || !body)
        return void res
            .status(400)
            .json({ detail: "title and body are required" });

    const db = createServerSupabase();
    const { data, error } = await db
        .from("gavel_clauses")
        .insert({ user_id: userId, title, category, body, guidance })
        .select("*")
        .single();
    if (error) {
        if (isMissingTable(error)) {
            return void res.status(503).json({
                detail: "Clause library is not set up on this deployment yet.",
            });
        }
        return void res.status(500).json({ detail: error.message });
    }
    logAudit({
        userId,
        action: "clause.save",
        resourceType: "clause",
        resourceId: data.id,
        metadata: { title },
        req,
    });
    res.status(201).json(data);
});

// PATCH /clauses/:clauseId — update own clause.
clausesRouter.patch("/:clauseId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { clauseId } = req.params;
    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (req.body?.title !== undefined) {
        const title = cleanText(req.body.title, MAX_TITLE);
        if (!title)
            return void res.status(400).json({ detail: "title cannot be empty" });
        updates.title = title;
    }
    if (req.body?.body !== undefined) {
        const body = cleanText(req.body.body, MAX_BODY);
        if (!body)
            return void res.status(400).json({ detail: "body cannot be empty" });
        updates.body = body;
    }
    if (req.body?.category !== undefined)
        updates.category = cleanText(req.body.category, 100) || null;
    if (req.body?.guidance !== undefined)
        updates.guidance = cleanText(req.body.guidance, 5000) || null;

    const db = createServerSupabase();
    const { data, error } = await db
        .from("gavel_clauses")
        .update(updates)
        .eq("id", clauseId)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();
    if (error) return void res.status(500).json({ detail: error.message });
    if (!data) return void res.status(404).json({ detail: "Clause not found" });
    logAudit({
        userId,
        action: "clause.save",
        resourceType: "clause",
        resourceId: clauseId,
        req,
    });
    res.json(data);
});

// DELETE /clauses/:clauseId — delete own clause.
clausesRouter.delete("/:clauseId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { clauseId } = req.params;
    const db = createServerSupabase();
    const { error, count } = await db
        .from("gavel_clauses")
        .delete({ count: "exact" })
        .eq("id", clauseId)
        .eq("user_id", userId);
    if (error) return void res.status(500).json({ detail: error.message });
    if (!count) return void res.status(404).json({ detail: "Clause not found" });
    logAudit({
        userId,
        action: "clause.delete",
        resourceType: "clause",
        resourceId: clauseId,
        req,
    });
    res.json({ ok: true });
});

/**
 * Search the user's clause library for the chat tool. Plain keyword
 * matching over title/category/body — the library is small and curated,
 * so keyword search beats embeddings on precision here.
 */
export async function searchClauseLibrary(
    userId: string,
    query: string,
    limit = 8,
): Promise<
    | { available: true; clauses: { title: string; category: string | null; body: string; guidance: string | null }[] }
    | { available: false }
> {
    const db = createServerSupabase();
    const terms = query
        .split(/\s+/)
        .map((t) => t.replace(/[%_,]/g, "").trim())
        .filter((t) => t.length >= 3)
        .slice(0, 6);
    let dbQuery = db
        .from("gavel_clauses")
        .select("title, category, body, guidance")
        .eq("user_id", userId)
        .limit(limit);
    if (terms.length > 0) {
        dbQuery = dbQuery.or(
            terms
                .flatMap((t) => [
                    `title.ilike.%${t}%`,
                    `category.ilike.%${t}%`,
                    `body.ilike.%${t}%`,
                ])
                .join(","),
        );
    }
    const { data, error } = await dbQuery;
    if (error) {
        if (isMissingTable(error)) return { available: false };
        throw error;
    }
    return { available: true, clauses: data ?? [] };
}
