-- Append-only audit trail for Gavel.
-- Written exclusively by the backend via the service role; RLS is enabled
-- with no policies, so anon/authenticated clients can neither read nor
-- write rows. Law-firm buyers ask for this in security review: who touched
-- which document/chat/review and when.

create table if not exists gavel_audit_log (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id uuid,
    action text not null,
    resource_type text,
    resource_id text,
    metadata jsonb,
    ip text
);

create index if not exists gavel_audit_log_user_created_idx
    on gavel_audit_log (user_id, created_at desc);
create index if not exists gavel_audit_log_action_created_idx
    on gavel_audit_log (action, created_at desc);

alter table gavel_audit_log enable row level security;

-- Block updates/deletes even for roles with table privileges: the log is
-- append-only by construction.
create or replace function gavel_audit_log_block_mutation()
returns trigger language plpgsql as $$
begin
    raise exception 'gavel_audit_log is append-only';
end;
$$;

drop trigger if exists gavel_audit_log_no_update on gavel_audit_log;
create trigger gavel_audit_log_no_update
    before update or delete on gavel_audit_log
    for each row execute function gavel_audit_log_block_mutation();
