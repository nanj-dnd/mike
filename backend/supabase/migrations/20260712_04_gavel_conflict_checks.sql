-- Conflict-of-interest checking for Gavel.
--
-- Every matter (project) can register the parties involved and which side
-- they were on. A conflict check takes a proposed party list and searches
-- the firm's register — the caller's own matters plus every matter owned
-- by an active member of their organizations — for name overlaps. Checks
-- themselves are recorded (query, hits, clear/flagged) because "we ran a
-- conflict check before opening the file" is the artefact firms need to
-- produce later.
-- Service-role access only: RLS enabled, no client policies.

create table if not exists gavel_matter_parties (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references projects(id) on delete cascade,
    -- Matter owner at write time; scopes org-wide searches without a join.
    user_id uuid not null,
    name text not null,
    normalized_name text not null,
    side text not null check (side in ('client', 'opposing', 'other')),
    created_at timestamptz not null default now()
);

create index if not exists gavel_matter_parties_project_idx
    on gavel_matter_parties (project_id);
create index if not exists gavel_matter_parties_user_idx
    on gavel_matter_parties (user_id);
create index if not exists gavel_matter_parties_normalized_idx
    on gavel_matter_parties (normalized_name);

create table if not exists gavel_conflict_checks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    -- Set when the check was run while opening/linking a specific matter.
    project_id uuid,
    parties jsonb not null,
    hits jsonb not null,
    status text not null check (status in ('clear', 'flagged')),
    created_at timestamptz not null default now()
);

create index if not exists gavel_conflict_checks_user_idx
    on gavel_conflict_checks (user_id, created_at desc);

alter table gavel_matter_parties enable row level security;
alter table gavel_conflict_checks enable row level security;
