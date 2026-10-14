import { z } from 'zod';
import { createUserClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';
import { ok, fail, handleError, rateLimited, clientIp } from '@/lib/http';

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  if (rateLimited(`login:${clientIp(req)}`, 10)) return fail('Too many attempts. Try again in a minute.', 429);
  try {
    const { email, password } = Body.parse(await req.json());
    const supabase = await createUserClient();

    if (!password) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${siteUrl()}/auth/callback`, shouldCreateUser: false },
      });
      if (error) return fail(error.message, 400);
      return ok({ magicLinkSent: true });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return fail('Email or password is incorrect.', 401);
    return ok({
      userId: data.user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    });
  } catch (err) {
    return handleError(err);
  }
}
