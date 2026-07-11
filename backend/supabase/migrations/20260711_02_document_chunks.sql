-- Semantic document index (RAG) for Gavel.
-- Chunked, embedded document text on pgvector; searched by the
-- assistant's search_documents tool via gavel_match_chunks. Written and
-- read exclusively by the backend service role: RLS enabled, no client
-- policies.

create extension if not exists vector;

create table if not exists gavel_document_chunks (
    id bigint generated always as identity primary key,
    document_id uuid not null,
    version_id uuid,
    chunk_index int not null,
    page int,
    content text not null,
    embedding vector(768) not null,
    embedding_model text not null,
    created_at timestamptz not null default now(),
    unique (document_id, chunk_index)
);

create index if not exists gavel_document_chunks_doc_idx
    on gavel_document_chunks (document_id);

-- HNSW scales without the row-count tuning ivfflat needs.
create index if not exists gavel_document_chunks_embedding_idx
    on gavel_document_chunks
    using hnsw (embedding vector_cosine_ops);

alter table gavel_document_chunks enable row level security;

create or replace function gavel_match_chunks(
    query_embedding vector(768),
    doc_ids uuid[],
    match_count int default 12
) returns table (
    document_id uuid,
    chunk_index int,
    page int,
    content text,
    similarity float
)
language sql stable as $$
    select
        c.document_id,
        c.chunk_index,
        c.page,
        c.content,
        1 - (c.embedding <=> query_embedding) as similarity
    from gavel_document_chunks c
    where c.document_id = any(doc_ids)
    order by c.embedding <=> query_embedding
    limit greatest(match_count, 1);
$$;
