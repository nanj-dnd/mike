-- Firm clause library (precedent bank) for Gavel.
-- Approved clause language with drafting guidance, searchable by the
-- assistant via the search_clause_library tool so drafts reuse the
-- firm's negotiated positions instead of generic AI language.
-- Service-role access only: RLS enabled, no client policies.

create table if not exists gavel_clauses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    title text not null,
    category text,
    body text not null,
    guidance text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists gavel_clauses_user_idx
    on gavel_clauses (user_id, created_at desc);

alter table gavel_clauses enable row level security;
