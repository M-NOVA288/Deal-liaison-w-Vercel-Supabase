import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '../env';

/**
 * Supabase client that acts AS the signed-in user (respects row-level security).
 * Use in route handlers and server components.
 * Also accepts "Authorization: Bearer <access_token>" so a mobile app can call the API later.
 */
export async function createUserClient(authHeader?: string | null) {
  const cookieStore = await cookies();
  return createServerClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component where cookies are read-only; safe to ignore.
        }
      },
    },
    global: authHeader?.startsWith('Bearer ') ? { headers: { Authorization: authHeader } } : undefined,
  });
}
