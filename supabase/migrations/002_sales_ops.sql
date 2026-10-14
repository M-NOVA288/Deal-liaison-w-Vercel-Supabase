-- Deal Engine: sales operations
-- Owner/admin access, premium client payments, guest purchase linking, playbook storage.

-- Owner flag. Set yourself as admin after signing up:
--   update public.profiles set is_admin = true where email = 'you@example.com';
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Premium plan quoting and payment tracking
alter table public.premium_requests add column if not exists price_cents integer;
alter table public.premium_requests add column if not exists checkout_url text;
alter table public.premium_requests add column if not exists stripe_session_id text unique;
alter table public.premium_requests add column if not exists paid_at timestamptz;
alter table public.premium_requests add column if not exists delivered_at timestamptz;
alter table public.premium_requests add column if not exists admin_notes text;

alter table public.purchases add column if not exists premium_request_id uuid
  references public.premium_requests (id) on delete set null;

create index if not exists purchases_created_idx on public.purchases (created_at desc);
create index if not exists purchases_email_idx on public.purchases (lower(email));
create index if not exists leads_created_idx on public.leads (created_at desc);

-- When someone signs up, attach anything they bought as a guest with the same email.
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

-- Private storage bucket for the playbook file. Upload it in Dashboard -> Storage -> playbook.
-- Buyers get short-lived signed download links from /api/playbook; the file is never public.
insert into storage.buckets (id, name, public)
values ('playbook', 'playbook', false)
on conflict (id) do nothing;
