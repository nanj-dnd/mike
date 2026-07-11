import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { normalizeEmail, findProfileUserByEmail } from "../lib/userLookup";
import { logAudit } from "../lib/auditLog";
import { sendOrgInviteEmail } from "../lib/email";

export const organizationsRouter = Router();

type Role = "admin" | "partner" | "associate";
const ROLES: Role[] = ["admin", "partner", "associate"];

type MemberRow = {
    id: string;
    org_id: string;
    user_id: string | null;
    email: string;
    role: Role;
    status: "invited" | "active";
    invited_by: string;
    created_at: string;
};

function isMissingTable(error: { code?: string; message: string }): boolean {
    return (
        error.code === "42P01" ||
        /could not find the table/i.test(error.message)
    );
}

/**
 * Load every organization the current user belongs to, opportunistically
 * activating any 'invited' membership row that matches their email — this
 * is how an invite "accepts" itself the first time the invited person
 * opens Account → Organization, no separate accept flow needed.
 */
async function loadMyMemberships(
    db: ReturnType<typeof createServerSupabase>,
    userId: string,
    userEmail: string | undefined,
): Promise<MemberRow[]> {
    const email = normalizeEmail(userEmail ?? "");

    const orConditions = [`user_id.eq.${userId}`];
    if (email) orConditions.push(`email.eq.${email}`);
    const { data, error } = await db
        .from("gavel_organization_members")
        .select("*")
        .or(orConditions.join(","));
    if (error) throw error;

    const rows = (data ?? []) as MemberRow[];
    const toActivate = rows.filter(
        (r) => r.status === "invited" && r.email === email && email,
    );
    for (const row of toActivate) {
        await db
            .from("gavel_organization_members")
            .update({
                user_id: userId,
                status: "active",
                updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        row.user_id = userId;
        row.status = "active";
    }
    return rows.filter((r) => r.status === "active" || r.user_id === userId);
}

async function requireAdminMembership(
    db: ReturnType<typeof createServerSupabase>,
    orgId: string,
    userId: string,
): Promise<MemberRow | null> {
    const { data } = await db
        .from("gavel_organization_members")
        .select("*")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
    const member = data as MemberRow | null;
    return member?.role === "admin" ? member : null;
}

async function requireAnyMembership(
    db: ReturnType<typeof createServerSupabase>,
    orgId: string,
    userId: string,
): Promise<MemberRow | null> {
    const { data } = await db
        .from("gavel_organization_members")
        .select("*")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
    return data as MemberRow | null;
}

// GET /organizations — every org the current user belongs to, with role.
organizationsRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const db = createServerSupabase();
    try {
        const memberships = await loadMyMemberships(db, userId, userEmail);
        if (memberships.length === 0) return void res.json({ organizations: [] });

        const orgIds = [...new Set(memberships.map((m) => m.org_id))];
        const { data: orgs, error } = await db
            .from("gavel_organizations")
            .select("*")
            .in("id", orgIds);
        if (error) throw error;

        const roleByOrg = new Map(memberships.map((m) => [m.org_id, m.role]));
        const organizations = (orgs ?? []).map((o) => ({
            id: o.id,
            name: o.name,
            created_at: o.created_at,
            my_role: roleByOrg.get(o.id) ?? null,
        }));
        res.json({ organizations });
    } catch (err) {
        const e = err as { code?: string; message: string };
        if (isMissingTable(e)) return void res.json({ organizations: [] });
        console.error("[organizations] list failed", e.message);
        res.status(500).json({ detail: "Failed to load organizations" });
    }
});

// POST /organizations — create an org; creator becomes its admin.
organizationsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return void res.status(400).json({ detail: "name is required" });
    const email = normalizeEmail(userEmail ?? "");
    if (!email)
        return void res.status(400).json({ detail: "Account email required" });

    const db = createServerSupabase();
    try {
        const { data: org, error } = await db
            .from("gavel_organizations")
            .insert({ name, created_by: userId })
            .select("*")
            .single();
        if (error) throw error;

        const { error: memberError } = await db
            .from("gavel_organization_members")
            .insert({
                org_id: org.id,
                user_id: userId,
                email,
                role: "admin",
                status: "active",
                invited_by: userId,
            });
        if (memberError) throw memberError;

        logAudit({
            userId,
            action: "organization.create",
            resourceType: "organization",
            resourceId: org.id,
            metadata: { name },
            req,
        });
        res.status(201).json({ id: org.id, name: org.name, my_role: "admin" });
    } catch (err) {
        const e = err as { code?: string; message: string };
        if (isMissingTable(e)) {
            return void res.status(503).json({
                detail:
                    "Organizations are not set up on this deployment yet.",
            });
        }
        console.error("[organizations] create failed", e.message);
        res.status(500).json({ detail: "Failed to create organization" });
    }
});

// GET /organizations/:orgId/members — any active member can view the roster.
organizationsRouter.get("/:orgId/members", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { orgId } = req.params;
    const db = createServerSupabase();
    const membership = await requireAnyMembership(db, orgId, userId);
    if (!membership)
        return void res.status(404).json({ detail: "Organization not found" });

    const { data, error } = await db
        .from("gavel_organization_members")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
    if (error) return void res.status(500).json({ detail: error.message });

    res.json({
        my_role: membership.role,
        members: (data ?? []).map((m) => ({
            id: m.id,
            email: m.email,
            role: m.role,
            status: m.status,
            created_at: m.created_at,
        })),
    });
});

// POST /organizations/:orgId/members — invite a member by email (admin only).
organizationsRouter.post("/:orgId/members", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { orgId } = req.params;
    const email = normalizeEmail(req.body?.email);
    const role = req.body?.role as Role;
    if (!email)
        return void res.status(400).json({ detail: "email is required" });
    if (!ROLES.includes(role))
        return void res
            .status(400)
            .json({ detail: `role must be one of: ${ROLES.join(", ")}` });

    const db = createServerSupabase();
    const admin = await requireAdminMembership(db, orgId, userId);
    if (!admin)
        return void res
            .status(403)
            .json({ detail: "Only organization admins can invite members" });

    const existingUser = await findProfileUserByEmail(db, email);
    const { data, error } = await db
        .from("gavel_organization_members")
        .upsert(
            {
                org_id: orgId,
                email,
                role,
                status: existingUser ? "active" : "invited",
                user_id: existingUser?.id ?? null,
                invited_by: userId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "org_id,email" },
        )
        .select("*")
        .single();
    if (error) return void res.status(500).json({ detail: error.message });

    logAudit({
        userId,
        action: "organization.invite_member",
        resourceType: "organization",
        resourceId: orgId,
        metadata: { email, role },
        req,
    });
    // Notify the invitee by email (fire-and-forget; invite works without it).
    const { data: orgRow } = await db
        .from("gavel_organizations")
        .select("name")
        .eq("id", orgId)
        .single();
    sendOrgInviteEmail({
        to: email,
        orgName: (orgRow?.name as string) ?? "your firm",
        invitedByEmail: admin.email,
        role,
    });
    res.status(201).json({
        id: data.id,
        email: data.email,
        role: data.role,
        status: data.status,
        created_at: data.created_at,
    });
});

// PATCH /organizations/:orgId/members/:memberId — change role (admin only).
organizationsRouter.patch(
    "/:orgId/members/:memberId",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { orgId, memberId } = req.params;
        const role = req.body?.role as Role;
        if (!ROLES.includes(role))
            return void res
                .status(400)
                .json({ detail: `role must be one of: ${ROLES.join(", ")}` });

        const db = createServerSupabase();
        const admin = await requireAdminMembership(db, orgId, userId);
        if (!admin)
            return void res
                .status(403)
                .json({ detail: "Only organization admins can change roles" });

        const { data: target } = await db
            .from("gavel_organization_members")
            .select("*")
            .eq("id", memberId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!target)
            return void res.status(404).json({ detail: "Member not found" });

        if (target.role === "admin" && role !== "admin") {
            const { count } = await db
                .from("gavel_organization_members")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("role", "admin")
                .eq("status", "active");
            if ((count ?? 0) <= 1) {
                return void res.status(400).json({
                    detail:
                        "Cannot demote the last admin. Promote another member first.",
                });
            }
        }

        const { error } = await db
            .from("gavel_organization_members")
            .update({ role, updated_at: new Date().toISOString() })
            .eq("id", memberId);
        if (error) return void res.status(500).json({ detail: error.message });

        logAudit({
            userId,
            action: "organization.change_role",
            resourceType: "organization",
            resourceId: orgId,
            metadata: { memberId, role },
            req,
        });
        res.json({ ok: true });
    },
);

// DELETE /organizations/:orgId/members/:memberId — remove a member (admin only).
organizationsRouter.delete(
    "/:orgId/members/:memberId",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { orgId, memberId } = req.params;
        const db = createServerSupabase();
        const admin = await requireAdminMembership(db, orgId, userId);
        if (!admin)
            return void res
                .status(403)
                .json({ detail: "Only organization admins can remove members" });

        const { data: target } = await db
            .from("gavel_organization_members")
            .select("*")
            .eq("id", memberId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!target)
            return void res.status(404).json({ detail: "Member not found" });

        if (target.role === "admin") {
            const { count } = await db
                .from("gavel_organization_members")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("role", "admin")
                .eq("status", "active");
            if ((count ?? 0) <= 1) {
                return void res.status(400).json({
                    detail:
                        "Cannot remove the last admin. Promote another member first.",
                });
            }
        }

        const { error } = await db
            .from("gavel_organization_members")
            .delete()
            .eq("id", memberId);
        if (error) return void res.status(500).json({ detail: error.message });

        logAudit({
            userId,
            action: "organization.remove_member",
            resourceType: "organization",
            resourceId: orgId,
            metadata: { memberId, email: target.email },
            req,
        });
        res.json({ ok: true });
    },
);

// GET /organizations/:orgId/audit-log — org-wide activity (admin only).
organizationsRouter.get(
    "/:orgId/audit-log",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { orgId } = req.params;
        const db = createServerSupabase();
        const admin = await requireAdminMembership(db, orgId, userId);
        if (!admin)
            return void res
                .status(403)
                .json({ detail: "Only organization admins can view the audit log" });

        const { data: members } = await db
            .from("gavel_organization_members")
            .select("user_id, email")
            .eq("org_id", orgId)
            .eq("status", "active");
        const memberUserIds = (members ?? [])
            .map((m) => m.user_id)
            .filter((id): id is string => !!id);
        if (memberUserIds.length === 0)
            return void res.json({ entries: [] });

        const { data: entries, error } = await db
            .from("gavel_audit_log")
            .select("*")
            .in("user_id", memberUserIds)
            .order("created_at", { ascending: false })
            .limit(200);
        if (error) {
            const e = error as { code?: string; message: string };
            if (isMissingTable(e)) return void res.json({ entries: [] });
            return void res.status(500).json({ detail: error.message });
        }

        const emailByUserId = new Map(
            (members ?? []).map((m) => [m.user_id, m.email]),
        );
        res.json({
            entries: (entries ?? []).map((e) => ({
                ...e,
                user_email: emailByUserId.get(e.user_id) ?? null,
            })),
        });
    },
);
