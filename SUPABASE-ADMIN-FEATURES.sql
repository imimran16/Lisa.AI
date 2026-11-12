-- Lisa AI Admin: run this COMPLETE script once in Supabase Dashboard > SQL Editor.
-- Creates real APK download tracking, editable public downloaders count and push subscriptions.

create table if not exists public.lisa_download_events (
  id bigint generated always as identity primary key,
  downloaded_at timestamptz not null default now()
);

create table if not exists public.lisa_app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lisa_push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

-- Admin API uses the Supabase service-role/secret key on the server.
grant all on table public.lisa_download_events to service_role;
grant all on table public.lisa_app_settings to service_role;
grant all on table public.lisa_push_subscriptions to service_role;
grant usage, select on sequence public.lisa_download_events_id_seq to service_role;

-- Seed the editable website number only if it does not already exist.
insert into public.lisa_app_settings(key, value)
values ('display_download_count', '0')
on conflict (key) do nothing;

-- Refresh PostgREST's schema cache so the new tables are available immediately.
notify pgrst, 'reload schema';
