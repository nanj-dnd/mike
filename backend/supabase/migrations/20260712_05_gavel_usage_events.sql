-- Operator-side usage and error telemetry for Gavel.
--
-- gavel_audit_log answers the customer's question ("who touched what");
-- this table answers the operator's ("is anyone using it, and is it
-- failing"). Key product actions and every 5xx response are recorded
-- fire-and-forget, then aggregated by the /admin/metrics endpoints,
-- which are gated to ADMIN_EMAILS.
-- Service-role access only: RLS enabled, no client policies.

create table if not exists gavel_usage_events (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id uuid,
    event text not null,
    route text,
    status integer,
    duration_ms integer,
    metadata jsonb
);

create index if not exists gavel_usage_events_created_idx
    on gavel_usage_events (created_at desc);
create index if not exists gavel_usage_events_event_idx
    on gavel_usage_events (event, created_at desc);
create index if not exists gavel_usage_events_user_idx
    on gavel_usage_events (user_id, created_at desc);

alter table gavel_usage_events enable row level security;
