-- Profile-enrichment fields collected in the post-signup "Almost there"
-- step. All optional/nullable; the backend degrades gracefully (drops
-- these fields from profile updates) until this migration is applied.

alter table public.user_profiles
    add column if not exists role text,
    add column if not exists practice_types text[],
    add column if not exists city text,
    add column if not exists state text;
