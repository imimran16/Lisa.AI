-- Lisa AI admin features: push subscriptions, real APK download events, display counter
create table if not exists public.lisa_push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);
alter table public.lisa_push_subscriptions enable row level security;

create table if not exists public.lisa_download_events (
  id bigint generated always as identity primary key,
  downloaded_at timestamptz not null default now()
);
alter table public.lisa_download_events enable row level security;

create table if not exists public.lisa_app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.lisa_app_settings enable row level security;

insert into public.lisa_app_settings(key,value)
values ('display_download_count','0')
on conflict (key) do nothing;
