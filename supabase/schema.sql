-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  shoe_name text not null,
  size text not null,
  purchase_date date not null,
  purchase_price numeric(10, 2) not null check (purchase_price > 0),
  image_url text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.deleted_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  shoe_name text not null,
  size text not null,
  purchase_date date not null,
  purchase_price numeric(10, 2) not null check (purchase_price > 0),
  image_url text not null default '',
  deleted_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.entries enable row level security;
alter table public.deleted_entries enable row level security;

create policy "Users manage their own entries"
  on public.entries for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own deleted entries"
  on public.deleted_entries for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
