-- Organization-level RBAC for Gavel.
--
-- A law firm creates one organization and invites colleagues by email with
-- a role. Membership gates: who can invite/remove members and change
-- roles (admin), and who can view the organization's audit trail (admin).
-- Written/read exclusively via the backend service role — RLS enabled,
-- no client policies, consistent with gavel_audit_log and
-- gavel_document_chunks.

create table if not exists gavel_organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_by uuid not null,
    created_at timestamptz not null default now()
);

create table if not exists gavel_organization_members (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references gavel_organizations(id) on delete cascade,
    -- Null until the invited user's account matches this email.
    user_id uuid,
    email text not null,
    role text not null check (role in ('admin', 'partner', 'associate')),
    status text not null default 'invited' check (status in ('invited', 'active')),
    invited_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (org_id, email)
);

create index if not exists gavel_org_members_org_idx
    on gavel_organization_members (org_id);
create index if not exists gavel_org_members_user_idx
    on gavel_organization_members (user_id);
create index if not exists gavel_org_members_email_idx
    on gavel_organization_members (email);

alter table gavel_organizations enable row level security;
alter table gavel_organization_members enable row level security;
