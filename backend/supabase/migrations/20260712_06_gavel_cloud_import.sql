-- Cloud document import accounts for Gavel.
--
-- One row per (user, provider): the OAuth tokens for a connected Google
-- Drive or OneDrive account, encrypted the same way as user API keys and
-- MCP connector auth (AES-256-GCM, per-row IV and auth tag). Files are
-- always fetched server-side with these tokens and pushed through the
-- normal document pipeline — the browser never sees them.
-- Service-role access only: RLS enabled, no client policies.

create table if not exists gavel_cloud_import_accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    provider text not null check (provider in ('google_drive', 'onedrive')),
    account_email text,
    encrypted_access_token text,
    access_token_iv text,
    access_token_tag text,
    encrypted_refresh_token text,
    refresh_token_iv text,
    refresh_token_tag text,
    access_token_expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, provider)
);

create index if not exists gavel_cloud_import_accounts_user_idx
    on gavel_cloud_import_accounts (user_id);

alter table gavel_cloud_import_accounts enable row level security;
