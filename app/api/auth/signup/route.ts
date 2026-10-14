import { z } from 'zod';
import { createUserClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';
import { ok, fail, handleError, rateLimited, clientIp } from '@/lib/http';

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  fullName: z.string().trim().max(120).optional(),
});

export async function POST(req: Request) {
  if (rateLimited(`signup:${clientIp(req)}`, 5)) return fail('Too many attempts. Try again in a minute.', 429);
  try {
    const { email, password, fullName } = Body.parse(await req.json());
    const supabase = await createUserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    if (error) return fail(error.message, 400);
    return ok({ userId: data.user?.id, needsEmailConfirmation: !data.session }, 201);
  } catch (err) {
    return handleError(err);
  }
}
