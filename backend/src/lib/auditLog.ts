import type { Request } from "express";
import { createServerSupabase } from "./supabase";

/**
 * Append-only audit trail (gavel_audit_log). Fire-and-forget by design:
 * an audit insert must never slow down or fail a user request. If the
 * table has not been created yet (migration not applied), logging disables
 * itself for the process lifetime after one warning instead of spamming
 * errors.
 */

export type AuditAction =
    | "document.upload"
    | "document.version_upload"
    | "document.download"
    | "document.delete"
    | "chat.create"
    | "chat.delete"
    | "tabular.create"
    | "tabular.generate"
    | "tabular.delete"
    | "data.export"
    | "data.delete"
    | "account.delete"
    | "api_key.save"
    | "api_key.delete"
    | "organization.create"
    | "organization.invite_member"
    | "organization.change_role"
    | "organization.remove_member"
    | "clause.save"
    | "clause.delete";

let auditDisabled = false;

/**
 * Route middleware that records an audit entry when the response finishes
 * successfully. Mounted in index.ts alongside the rate limiters so the
 * whole audit surface is declared in one place. `res.locals.userId` is
 * read at finish time, after requireAuth has populated it.
 */
export function audited(
    action: AuditAction,
    resource?: (req: Request) => {
        type?: string;
        id?: string;
    },
) {
    return (
        req: Request,
        res: import("express").Response,
        next: import("express").NextFunction,
    ) => {
        res.on("finish", () => {
            if (res.statusCode >= 400) return;
            const userId =
                typeof res.locals.userId === "string"
                    ? res.locals.userId
                    : null;
            if (!userId) return;
            const r = resource?.(req);
            logAudit({
                userId,
                action,
                resourceType: r?.type,
                resourceId: r?.id,
                req,
            });
        });
        next();
    };
}

export function clientIp(req: Request): string | null {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0]!.trim();
    }
    return req.ip ?? null;
}

export function logAudit(entry: {
    userId: string | null;
    action: AuditAction;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    req?: Request;
}): void {
    if (auditDisabled) return;
    const db = createServerSupabase();
    void db
        .from("gavel_audit_log")
        .insert({
            user_id: entry.userId,
            action: entry.action,
            resource_type: entry.resourceType ?? null,
            resource_id: entry.resourceId ?? null,
            metadata: entry.metadata ?? null,
            ip: entry.req ? clientIp(entry.req) : null,
        })
        .then(({ error }) => {
            if (!error) return;
            if (
                error.code === "42P01" ||
                /could not find the table/i.test(error.message)
            ) {
                auditDisabled = true;
                console.warn(
                    "[audit] gavel_audit_log table missing — audit logging disabled. Apply supabase/migrations/20260711_01_gavel_audit_log.sql.",
                );
            } else {
                console.error("[audit] insert failed:", error.message);
            }
        });
}
