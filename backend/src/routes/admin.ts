import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import {
    aggregateUsage,
    type UsageEventRow,
} from "../lib/usageMetrics";

/**
 * Operator-only endpoints. Access is by allow-list: ADMIN_EMAILS is a
 * comma-separated env var of operator addresses. Everyone else gets a
 * 404 — the admin surface shouldn't even be discoverable from a probe.
 */

export const adminRouter = Router();

function adminEmails(): Set<string> {
    return new Set(
        (process.env.ADMIN_EMAILS ?? "")
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
    );
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const email = (res.locals.userEmail as string | undefined)?.toLowerCase();
    if (!email || !adminEmails().has(email)) {
        return void res.status(404).json({ detail: "Not found" });
    }
    next();
}

function daysParam(req: Request, fallback: number, max: number): number {
    const raw = Number.parseInt(String(req.query.days ?? ""), 10);
    if (!Number.isFinite(raw) || raw < 1) return fallback;
    return Math.min(raw, max);
}

function isMissingUsageTable(error: {
    code?: string;
    message: string;
}): boolean {
    return (
        error.code === "42P01" ||
        /could not find the table/i.test(error.message)
    );
}

// GET /admin/metrics?days=30 — adoption and error aggregates.
adminRouter.get("/metrics", requireAuth, requireAdmin, async (req, res) => {
    const days = daysParam(req, 30, 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const db = createServerSupabase();
    const { data, error } = await db
        .from("gavel_usage_events")
        .select("event, user_id, status, created_at")
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(50000);
    if (error) {
        if (isMissingUsageTable(error)) {
            return void res.status(503).json({
                detail:
                    "Usage metrics are not set up on this deployment yet. Apply migration 20260712_05_gavel_usage_events.sql.",
            });
        }
        return void res.status(500).json({ detail: error.message });
    }

    res.json({
        days,
        sampled: (data ?? []).length >= 50000,
        ...aggregateUsage((data ?? []) as UsageEventRow[]),
    });
});

// GET /admin/errors?days=7 — most recent server errors, newest first.
adminRouter.get("/errors", requireAuth, requireAdmin, async (req, res) => {
    const days = daysParam(req, 7, 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const db = createServerSupabase();
    const { data, error } = await db
        .from("gavel_usage_events")
        .select("route, status, metadata, created_at")
        .eq("event", "server_error")
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
    if (error) {
        if (isMissingUsageTable(error)) {
            return void res.status(503).json({
                detail:
                    "Usage metrics are not set up on this deployment yet. Apply migration 20260712_05_gavel_usage_events.sql.",
            });
        }
        return void res.status(500).json({ detail: error.message });
    }
    res.json({ days, errors: data ?? [] });
});
