-- Run this in your Supabase SQL Editor

DROP FUNCTION IF EXISTS find_similar_questions(vector(768), float, int);

create or replace function find_similar_questions (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  question_text text,
  intent_id uuid,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    q.id,
    q.question_text,
    q.intent_id,
    1 - (e.vector <=> query_embedding) as similarity
  from public.questions q
  join public.embeddings e on q.id = e.question_id
  where 1 - (e.vector <=> query_embedding) > match_threshold
  order by e.vector <=> query_embedding
  limit match_count;
end;
$$;
