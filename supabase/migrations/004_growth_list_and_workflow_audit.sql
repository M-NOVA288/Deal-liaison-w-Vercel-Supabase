-- Separate email lists (deals vs growth) and allow the $299 Workflow Audit product.
alter table public.leads add column if not exists list text not null default 'deals';
alter table public.leads drop constraint if exists leads_list_check;
alter table public.leads add constraint leads_list_check check (list in ('deals', 'growth'));
alter table public.leads drop constraint if exists leads_email_key;
create unique index if not exists leads_email_list_key on public.leads (email, list);
alter table public.purchases drop constraint if exists purchases_product_check;
alter table public.purchases add constraint purchases_product_check
  check (product in ('playbook', 'pro_subscription', 'premium_plan', 'deal_review', 'workflow_audit'));
