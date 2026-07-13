-- Workflow orchestration engine: graph definitions (versioned), durable
-- runs, per-node executions, structured run events, and triggers.
-- Backend-only tables (service role); RLS enabled with no policies, same
-- as the other gavel_* tables. The engine self-disables with a clear
-- message until this migration is applied.

create table if not exists gavel_workflow_graphs (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    name text not null,
    description text,
    -- Set when this graph is the auto-generated wrapper for a legacy
    -- prompt-template workflow (workflows.id uuid or 'builtin-*' slug).
    template_workflow_id text,
    latest_version int not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists gavel_workflow_graphs_user_idx
    on gavel_workflow_graphs (user_id, created_at desc);
create unique index if not exists gavel_workflow_graphs_template_key
    on gavel_workflow_graphs (user_id, template_workflow_id)
    where template_workflow_id is not null;

-- Immutable definition snapshots: every edit inserts a new version, so
-- in-flight runs (which pin a version_id) are never broken by edits.
create table if not exists gavel_workflow_graph_versions (
    id uuid primary key default gen_random_uuid(),
    graph_id uuid not null references gavel_workflow_graphs(id) on delete cascade,
    version int not null,
    definition jsonb not null,
    created_at timestamptz not null default now(),
    unique (graph_id, version)
);

create table if not exists gavel_workflow_runs (
    id uuid primary key default gen_random_uuid(),
    graph_id uuid not null references gavel_workflow_graphs(id) on delete cascade,
    version_id uuid not null references gavel_workflow_graph_versions(id),
    user_id text not null,
    status text not null default 'pending', -- pending|running|waiting|succeeded|failed|canceled
    trigger_source text not null default 'manual', -- manual|cron|webhook|template
    input jsonb,
    output jsonb,
    error text,
    heartbeat_at timestamptz,
    timeout_at timestamptz,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists gavel_workflow_runs_graph_idx
    on gavel_workflow_runs (graph_id, created_at desc);
create index if not exists gavel_workflow_runs_user_idx
    on gavel_workflow_runs (user_id, created_at desc);
create index if not exists gavel_workflow_runs_status_idx
    on gavel_workflow_runs (status);

create table if not exists gavel_workflow_node_runs (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references gavel_workflow_runs(id) on delete cascade,
    -- Loop-body nodes are namespaced: '<loopId>#<iteration>.<bodyNodeId>'.
    node_id text not null,
    iteration_key text not null default '',
    attempt int not null default 1,
    status text not null default 'pending', -- pending|running|succeeded|failed|skipped|waiting
    input jsonb,
    output jsonb,
    error jsonb,
    idempotency_key text,
    model text,
    prompt_tokens int,
    completion_tokens int,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz not null default now(),
    unique (run_id, node_id)
);

create index if not exists gavel_workflow_node_runs_run_idx
    on gavel_workflow_node_runs (run_id, created_at);

-- Structured engine logs keyed by run/node; append-only like the audit log.
create table if not exists gavel_workflow_run_events (
    id bigint generated always as identity primary key,
    run_id uuid not null references gavel_workflow_runs(id) on delete cascade,
    node_id text,
    level text not null default 'info', -- info|warn|error
    message text not null,
    data jsonb,
    created_at timestamptz not null default now()
);

create index if not exists gavel_workflow_run_events_run_idx
    on gavel_workflow_run_events (run_id, id);

create table if not exists gavel_workflow_triggers (
    id uuid primary key default gen_random_uuid(),
    graph_id uuid not null references gavel_workflow_graphs(id) on delete cascade,
    user_id text not null,
    type text not null, -- cron|webhook
    cron_expr text,
    slug text unique,
    secret_hash text,
    input jsonb,
    enabled boolean not null default true,
    next_run_at timestamptz,
    last_run_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists gavel_workflow_triggers_due_idx
    on gavel_workflow_triggers (next_run_at)
    where enabled = true;

alter table gavel_workflow_graphs enable row level security;
alter table gavel_workflow_graph_versions enable row level security;
alter table gavel_workflow_runs enable row level security;
alter table gavel_workflow_node_runs enable row level security;
alter table gavel_workflow_run_events enable row level security;
alter table gavel_workflow_triggers enable row level security;
