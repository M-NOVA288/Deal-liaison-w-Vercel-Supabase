import { createUserClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';

/** Returns the signed-in user (cookie or Bearer token) and a client acting as them. */
export async function getUser(req: Request) {
  const supabase = await createUserClient(req.headers.get('authorization'));
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Returns the user only if they are an admin (profiles.is_admin = true). */
export async function requireAdmin(req: Request) {
  const { user } = await getUser(req);
  if (!user) return null;
  const { data } = await createAdminClient().from('profiles').select('is_admin').eq('id', user.id).single();
  return data?.is_admin ? user : null;
}
