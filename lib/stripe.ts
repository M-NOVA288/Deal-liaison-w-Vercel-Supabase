import Stripe from 'stripe';
import { env } from './env';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) client = new Stripe(env('STRIPE_SECRET_KEY'));
  return client;
}

export type ProductKey = 'playbook' | 'pro_subscription' | 'deal_review' | 'workflow_audit';

export const PRODUCTS: Record<ProductKey, { priceEnv: string; mode: 'payment' | 'subscription' }> = {
  playbook: { priceEnv: 'STRIPE_PRICE_PLAYBOOK', mode: 'payment' },
  pro_subscription: { priceEnv: 'STRIPE_PRICE_PRO_MONTHLY', mode: 'subscription' },
  deal_review: { priceEnv: 'STRIPE_PRICE_DEAL_REVIEW', mode: 'payment' },
  workflow_audit: { priceEnv: 'STRIPE_PRICE_WORKFLOW_AUDIT', mode: 'payment' },
};
