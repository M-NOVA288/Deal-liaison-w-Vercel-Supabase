-- Deal Engine: initial schema
-- Run this in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run

-- =========================================================
-- PROFILES: one row per user (auto-created on signup)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  subscription_status text,                -- mirrors Stripe: active, trialing, past_due, canceled...
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  has_playbook boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- DEALS: businesses a user is analyzing (Pro feature: saved deals)
-- =========================================================
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  industry text,
  stage text not null default 'reviewing'
    check (stage in ('reviewing', 'diligence', 'offer', 'under_contract', 'closed', 'passed')),
  inputs jsonb not null,                  -- what the user typed into the analyzer
  results jsonb not null,                 -- analyzer output at time of save
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_user_id_idx on public.deals (user_id, created_at desc);

-- =========================================================
-- PURCHASES: every completed Stripe payment (playbook, plans, subscription starts)
-- Written only by the server (Stripe webhook) using the service role key.
-- =========================================================
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  product text not null check (product in ('playbook', 'pro_subscription', 'premium_plan')),
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_session_id text unique not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- LEADS: email captures from the onboarding page (before signup)
-- =========================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  source text,                             -- tiktok, instagram, facebook, direct...
  consent boolean not null default false,  -- agreed to receive emails
  created_at timestamptz not null default now()
);

-- =========================================================
-- PREMIUM REQUESTS: done-for-you acquisition plan intake
-- =========================================================
create table if not exists public.premium_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  name text not null,
  business_description text not null,
  asking_price numeric,
  financing_type text,                     -- sba, seller_financing, cash, other
  deadline date,
  status text not null default 'new'
    check (status in ('new', 'call_booked', 'contract_sent', 'paid', 'in_progress', 'delivered', 'declined')),
  created_at timestamptz not null default now()
);

-- =========================================================
-- updated_at helper
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists deals_updated_at on public.deals;
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- =========================================================
-- Auto-create a profile when someone signs up
-- =========================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- ROW LEVEL SECURITY: users only ever see their own data
-- =========================================================
alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.purchases enable row level security;
alter table public.leads enable row level security;
alter table public.premium_requests enable row level security;

-- Profiles: read your own. No client updates to plan/billing fields (server only).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Deals: full control of your own deals, and only Pro users can create them.
drop policy if exists "deals_select_own" on public.deals;
create policy "deals_select_own" on public.deals
  for select using (auth.uid() = user_id);

drop policy if exists "deals_insert_pro" on public.deals;
create policy "deals_insert_pro" on public.deals
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'pro')
  );

drop policy if exists "deals_update_own" on public.deals;
create policy "deals_update_own" on public.deals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "deals_delete_own" on public.deals;
create policy "deals_delete_own" on public.deals
  for delete using (auth.uid() = user_id);

-- Purchases & premium requests: read your own. Writes happen server-side only.
drop policy if exists "purchases_select_own" on public.purchases;
create policy "purchases_select_own" on public.purchases
  for select using (auth.uid() = user_id);

drop policy if exists "premium_select_own" on public.premium_requests;
create policy "premium_select_own" on public.premium_requests
  for select using (auth.uid() = user_id);

-- Leads: no client policies at all -> only the server (service role) can read/write.
