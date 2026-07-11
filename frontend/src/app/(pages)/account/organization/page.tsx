"use client";

import { useEffect, useState } from "react";
import { Loader2, Shield, Trash2 } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import {
    createOrganization,
    getOrganizationAuditLog,
    inviteOrganizationMember,
    listOrganizationMembers,
    listOrganizations,
    removeOrganizationMember,
    updateOrganizationMemberRole,
    type AuditLogEntry,
    type OrganizationMember,
    type OrganizationSummary,
    type OrgRole,
} from "@/app/lib/mikeApi";
import {
    accountGlassInputClassName,
    accountGlassDangerButtonClassName,
    accountGlassPrimaryButtonClassName,
} from "../accountStyles";
import { AccountSection } from "../AccountSection";

const ROLE_OPTIONS: { value: OrgRole; label: string; description: string }[] = [
    {
        value: "admin",
        label: "Admin",
        description: "Manages members, roles, and can view the firm's audit log.",
    },
    {
        value: "partner",
        label: "Partner",
        description: "Full use of the platform. No member-management access.",
    },
    {
        value: "associate",
        label: "Associate",
        description: "Full use of the platform. No member-management access.",
    },
];

export default function OrganizationPage() {
    const [loading, setLoading] = useState(true);
    const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
    const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [myRole, setMyRole] = useState<OrgRole | null>(null);
    const [membersLoading, setMembersLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [newOrgName, setNewOrgName] = useState("");
    const [creating, setCreating] = useState(false);

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<OrgRole>("associate");
    const [inviting, setInviting] = useState(false);

    const [auditLog, setAuditLog] = useState<AuditLogEntry[] | null>(null);
    const [auditLoading, setAuditLoading] = useState(false);
    const [showAudit, setShowAudit] = useState(false);

    const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;
    const isAdmin = myRole === "admin";

    const loadOrgs = async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await listOrganizations();
            setOrgs(list);
            setActiveOrgId((current) => current ?? list[0]?.id ?? null);
        } catch {
            setError("Failed to load organizations.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrgs();
    }, []);

    const loadMembers = async (orgId: string) => {
        setMembersLoading(true);
        try {
            const { members: list, my_role } = await listOrganizationMembers(
                orgId,
            );
            setMembers(list);
            setMyRole(my_role);
        } catch {
            setError("Failed to load members.");
        } finally {
            setMembersLoading(false);
        }
    };

    useEffect(() => {
        if (activeOrgId) {
            loadMembers(activeOrgId);
            setAuditLog(null);
            setShowAudit(false);
        }
    }, [activeOrgId]);

    const handleCreateOrg = async () => {
        const name = newOrgName.trim();
        if (!name) return;
        setCreating(true);
        setError(null);
        try {
            const org = await createOrganization(name);
            setNewOrgName("");
            await loadOrgs();
            setActiveOrgId(org.id);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to create organization.",
            );
        } finally {
            setCreating(false);
        }
    };

    const handleInvite = async () => {
        const email = inviteEmail.trim();
        if (!email || !activeOrgId) return;
        setInviting(true);
        setError(null);
        try {
            await inviteOrganizationMember(activeOrgId, email, inviteRole);
            setInviteEmail("");
            await loadMembers(activeOrgId);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to add member.",
            );
        } finally {
            setInviting(false);
        }
    };

    const handleRoleChange = async (memberId: string, role: OrgRole) => {
        if (!activeOrgId) return;
        try {
            await updateOrganizationMemberRole(activeOrgId, memberId, role);
            await loadMembers(activeOrgId);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to update role.",
            );
        }
    };

    const handleRemove = async (memberId: string) => {
        if (!activeOrgId) return;
        try {
            await removeOrganizationMember(activeOrgId, memberId);
            await loadMembers(activeOrgId);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to remove member.",
            );
        }
    };

    const handleToggleAudit = async () => {
        if (!activeOrgId) return;
        if (showAudit) {
            setShowAudit(false);
            return;
        }
        setShowAudit(true);
        if (auditLog !== null) return;
        setAuditLoading(true);
        try {
            const entries = await getOrganizationAuditLog(activeOrgId);
            setAuditLog(entries);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load audit log.",
            );
        } finally {
            setAuditLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading organizations…
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="mb-1 text-2xl font-medium font-serif text-gray-900">
                    Organization
                </h2>
                <p className="text-sm text-gray-500">
                    Create a firm workspace, invite colleagues by email, and
                    assign roles. Admins manage membership and can view the
                    firm-wide audit trail; Partner and Associate are
                    informational roles for how your firm is structured.
                </p>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {orgs.length === 0 ? (
                <AccountSection className="space-y-3 p-4">
                    <p className="text-sm text-gray-700">
                        You&apos;re not part of a firm workspace yet. Create
                        one to invite colleagues and manage roles.
                    </p>
                    <div className="flex gap-2">
                        <Input
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                            placeholder="Firm name, e.g. Desai & Associates"
                            className={`flex-1 ${accountGlassInputClassName}`}
                        />
                        <Button
                            onClick={handleCreateOrg}
                            disabled={creating || !newOrgName.trim()}
                            className={accountGlassPrimaryButtonClassName}
                        >
                            {creating ? "Creating…" : "Create"}
                        </Button>
                    </div>
                </AccountSection>
            ) : (
                <>
                    {orgs.length > 1 && (
                        <div className="flex gap-2">
                            {orgs.map((o) => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => setActiveOrgId(o.id)}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                        o.id === activeOrgId
                                            ? "bg-gray-900 text-white"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    {o.name}
                                </button>
                            ))}
                        </div>
                    )}

                    <AccountSection className="p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-base font-medium text-gray-900">
                                    {activeOrg?.name}
                                </p>
                                <p className="text-sm text-gray-500">
                                    Your role:{" "}
                                    <span className="font-medium capitalize">
                                        {myRole ?? "—"}
                                    </span>
                                </p>
                            </div>
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={handleToggleAudit}
                                    className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
                                >
                                    <Shield className="h-4 w-4" />
                                    {showAudit ? "Hide" : "View"} audit log
                                </button>
                            )}
                        </div>

                        {isAdmin && (
                            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
                                <Input
                                    value={inviteEmail}
                                    onChange={(e) =>
                                        setInviteEmail(e.target.value)
                                    }
                                    placeholder="colleague@firm.com"
                                    className={`min-w-0 flex-1 bg-white ${accountGlassInputClassName}`}
                                />
                                <select
                                    value={inviteRole}
                                    onChange={(e) =>
                                        setInviteRole(
                                            e.target.value as OrgRole,
                                        )
                                    }
                                    className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
                                >
                                    {ROLE_OPTIONS.map((r) => (
                                        <option key={r.value} value={r.value}>
                                            {r.label}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    onClick={handleInvite}
                                    disabled={inviting || !inviteEmail.trim()}
                                    className={accountGlassPrimaryButtonClassName}
                                >
                                    {inviting ? "Adding…" : "Add member"}
                                </Button>
                            </div>
                        )}

                        {membersLoading ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading members…
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {members.map((m) => (
                                    <div
                                        key={m.id}
                                        className="flex items-center justify-between py-2.5"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm text-gray-900">
                                                {m.email}
                                            </p>
                                            {m.status === "invited" && (
                                                <p className="text-xs text-amber-600">
                                                    Invited — not yet
                                                    signed in
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {isAdmin ? (
                                                <select
                                                    value={m.role}
                                                    onChange={(e) =>
                                                        handleRoleChange(
                                                            m.id,
                                                            e.target
                                                                .value as OrgRole,
                                                        )
                                                    }
                                                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 capitalize"
                                                >
                                                    {ROLE_OPTIONS.map((r) => (
                                                        <option
                                                            key={r.value}
                                                            value={r.value}
                                                        >
                                                            {r.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="text-sm capitalize text-gray-600">
                                                    {m.role}
                                                </span>
                                            )}
                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemove(m.id)
                                                    }
                                                    className={`${accountGlassDangerButtonClassName} p-1.5`}
                                                    title="Remove member"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </AccountSection>

                    {isAdmin && showAudit && (
                        <AccountSection className="p-4">
                            <p className="mb-3 text-sm font-medium text-gray-900">
                                Firm activity (last 200 events)
                            </p>
                            {auditLoading ? (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading…
                                </div>
                            ) : auditLog && auditLog.length > 0 ? (
                                <div className="max-h-96 overflow-y-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="text-xs uppercase text-gray-400">
                                                <th className="pb-2 pr-3 font-medium">
                                                    When
                                                </th>
                                                <th className="pb-2 pr-3 font-medium">
                                                    Who
                                                </th>
                                                <th className="pb-2 pr-3 font-medium">
                                                    Action
                                                </th>
                                                <th className="pb-2 font-medium">
                                                    Resource
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {auditLog.map((e) => (
                                                <tr key={e.id}>
                                                    <td className="whitespace-nowrap py-1.5 pr-3 text-gray-500">
                                                        {new Date(
                                                            e.created_at,
                                                        ).toLocaleString()}
                                                    </td>
                                                    <td className="py-1.5 pr-3 text-gray-700">
                                                        {e.user_email ??
                                                            e.user_id}
                                                    </td>
                                                    <td className="py-1.5 pr-3 text-gray-900">
                                                        {e.action}
                                                    </td>
                                                    <td className="py-1.5 text-gray-500">
                                                        {e.resource_type
                                                            ? `${e.resource_type}${e.resource_id ? ` · ${e.resource_id.slice(0, 8)}` : ""}`
                                                            : "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">
                                    No activity recorded yet.
                                </p>
                            )}
                        </AccountSection>
                    )}
                </>
            )}
        </div>
    );
}
