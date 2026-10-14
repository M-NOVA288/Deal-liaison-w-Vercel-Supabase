-- Deal Engine: ONE-TIME SETUP
-- Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- (Same result as running migrations 001 and 002, combined and tightened.)

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  subscription_status text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  has_playbook boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  industry text,
  stage text not null default 'reviewing'
    check (stage in ('reviewing', 'diligence', 'offer', 'under_contract', 'closed', 'passed')),
  inputs jsonb not null,
  results jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_user_id_idx on public.deals (user_id, created_at desc);

create table if not exists public.premium_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  name text not null,
  business_description text not null,
  asking_price numeric,
  financing_type text,
  deadline date,
  status text not null default 'new'
    check (status in ('new', 'call_booked', 'contract_sent', 'paid', 'in_progress', 'delivered', 'declined')),
  price_cents integer,
  checkout_url text,
  stripe_session_id text unique,
  paid_at timestamptz,
  delivered_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  product text not null check (product in ('playbook', 'pro_subscription', 'premium_plan')),
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_session_id text unique not null,
  premium_request_id uuid references public.premium_requests (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists purchases_created_idx on public.purchases (created_at desc);
create index if not exists purchases_email_idx on public.purchases (lower(email));
create index if not exists purchases_user_idx on public.purchases (user_id);
create index if not exists purchases_premium_idx on public.purchases (premium_request_id);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  source text,
  consent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists premium_user_idx on public.premium_requests (user_id);

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

-- New signup -> profile row, and link anything they bought as a guest with the same email.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, has_playbook)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    exists (select 1 from public.purchases p where lower(p.email) = lower(new.email) and p.product = 'playbook')
  )
  on conflict (id) do nothing;

  update public.purchases set user_id = new.id
    where user_id is null and lower(email) = lower(new.email);
  update public.premium_requests set user_id = new.id
    where user_id is null and lower(email) = lower(new.email);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row level security: users only see their own data; leads are server-only.
alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.purchases enable row level security;
alter table public.leads enable row level security;
alter table public.premium_requests enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "deals_select_own" on public.deals;
create policy "deals_select_own" on public.deals
  for select using ((select auth.uid()) = user_id);

drop policy if exists "deals_insert_pro" on public.deals;
create policy "deals_insert_pro" on public.deals
  for insert with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.plan = 'pro')
  );

drop policy if exists "deals_update_own" on public.deals;
create policy "deals_update_own" on public.deals
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "deals_delete_own" on public.deals;
create policy "deals_delete_own" on public.deals
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "purchases_select_own" on public.purchases;
create policy "purchases_select_own" on public.purchases
  for select using ((select auth.uid()) = user_id);

drop policy if exists "premium_select_own" on public.premium_requests;
create policy "premium_select_own" on public.premium_requests
  for select using ((select auth.uid()) = user_id);

-- Private bucket for the playbook PDF.
insert into storage.buckets (id, name, public)
values ('playbook', 'playbook', false)
on conflict (id) do nothing;

-- ===== Later migrations (003, 004) =====
-- Allow the $299 Deal Review product and store the listing the buyer entered at checkout.
alter table public.purchases drop constraint if exists purchases_product_check;
alter table public.purchases add constraint purchases_product_check
  check (product in ('playbook', 'pro_subscription', 'premium_plan', 'deal_review'));
alter table public.purchases add column if not exists details text;

-- Separate email lists (deals vs growth) and allow the $299 Workflow Audit product.
alter table public.leads add column if not exists list text not null default 'deals';
alter table public.leads drop constraint if exists leads_list_check;
alter table public.leads add constraint leads_list_check check (list in ('deals', 'growth'));
alter table public.leads drop constraint if exists leads_email_key;
create unique index if not exists leads_email_list_key on public.leads (email, list);
alter table public.purchases drop constraint if exists purchases_product_check;
alter table public.purchases add constraint purchases_product_check
  check (product in ('playbook', 'pro_subscription', 'premium_plan', 'deal_review', 'workflow_audit'));
