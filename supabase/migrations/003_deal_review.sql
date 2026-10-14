-- Allow the $299 Deal Review product and store the listing the buyer entered at checkout.
alter table public.purchases drop constraint if exists purchases_product_check;
alter table public.purchases add constraint purchases_product_check
  check (product in ('playbook', 'pro_subscription', 'premium_plan', 'deal_review'));
alter table public.purchases add column if not exists details text;
