import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

/**
 * Admin client using the service role key. BYPASSES row-level security.
 * Server-only: use it for Stripe webhooks, lead capture, and other trusted writes.
 * Never import this from client components.
 */
export function createAdminClient() {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
