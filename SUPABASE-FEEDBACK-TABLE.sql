create table if not exists public.lisa_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rating smallint not null check (rating between 1 and 5),
  name varchar(60) not null,
  instagram varchar(30),
  message varchar(500) not null
);

alter table public.lisa_feedback enable row level security;

-- Do not add anon/public policies. The Vercel API accesses this table
-- using the Supabase secret/service-role key stored only in server env vars.
