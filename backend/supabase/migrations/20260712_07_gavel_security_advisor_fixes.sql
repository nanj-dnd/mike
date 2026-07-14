-- Fixes for Supabase Security Advisor warnings (2026-07-12 review).
--
-- 1) "Function Search Path Mutable" on six functions: none pin
--    search_path, so a caller able to create objects earlier in their
--    session's search_path could shadow the public.-qualified names
--    these functions reference. Every function below already fully
--    qualifies its table/column references, so pinning search_path is a
--    pure hardening no-op — behavior is unchanged.
--
-- 2) "Extension in Public": pgvector was installed into `public` by
--    `create extension if not exists vector;` (20260711_02). Supabase's
--    own guidance is to keep extensions out of `public`. Moving a
--    relocatable extension's schema does not touch existing columns —
--    Postgres resolves the `vector` type by OID, not by name — so
--    gavel_document_chunks.embedding and its HNSW index keep working
--    across the move with no data or index rebuild. gavel_match_chunks'
--    search_path is pinned to include `extensions` explicitly rather
--    than depending on the database's default search_path also
--    containing it.
--
-- Not fixed here (not SQL-fixable):
--   - "Leaked Password Protection Disabled" is a Supabase Auth setting:
--     Dashboard -> Authentication -> Policies (or Auth Settings) ->
--     Password Security -> enable "Leaked password protection".
--   - "RLS Enabled No Policy" on every gavel_*/user_mcp_*/user_api_keys/
--     courtlistener_*/contact_messages/workflow_open_source_submissions
--     table is intentional, not a gap: every one of these is written and
--     read exclusively by the backend's service-role key, which bypasses
--     RLS entirely. RLS-enabled-with-no-policy means anon/authenticated
--     clients are denied by default — the safest possible posture for a
--     table no browser client should ever touch directly. No policy
--     should be added unless a table is meant to be queried directly by
--     the Supabase client SDK (none currently are — see the
--     20260508_0*_revoke_client_grants migrations).

alter function public.get_chats_overview(text, integer)
    set search_path = public;

alter function public.get_projects_overview(text, text)
    set search_path = public;

alter function public.get_tabular_reviews_overview(text, text, text)
    set search_path = public;

alter function public.get_workflows_overview(text, text, text)
    set search_path = public;

alter function public.gavel_audit_log_block_mutation()
    set search_path = public;

-- Move pgvector out of public, then re-pin gavel_match_chunks' own
-- search_path to include the new schema so it never depends on the
-- database's default search_path also listing it. The function must be
-- identified with the type's new schema-qualified name (extensions.vector)
-- in this same statement — once moved, the bare `vector` name only
-- resolves for sessions whose search_path already includes `extensions`.
create schema if not exists extensions;
alter extension vector set schema extensions;

alter function public.gavel_match_chunks(extensions.vector(768), uuid[], integer)
    set search_path = public, extensions;
