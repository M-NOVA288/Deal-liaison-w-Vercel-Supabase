import { createUserClient } from '@/lib/supabase/server';
import { ok } from '@/lib/http';

export async function POST(req: Request) {
  const supabase = await createUserClient(req.headers.get('authorization'));
  await supabase.auth.signOut();
  return ok({ ok: true });
}
