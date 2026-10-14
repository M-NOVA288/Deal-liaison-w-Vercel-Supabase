import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitEvent } from '@/lib/automation';
import { ok, fail, handleError, rateLimited, clientIp } from '@/lib/http';

const Lead = z.object({
  email: z.string().trim().toLowerCase().email(),
  source: z.enum(['tiktok', 'instagram', 'facebook', 'youtube', 'direct', 'other']).default('direct'),
  consent: z.boolean().default(false),
  list: z.enum(['deals', 'growth']).default('deals'),
});

export async function POST(req: Request) {
  if (rateLimited(`leads:${clientIp(req)}`, 10)) return fail('Too many requests.', 429);
  try {
    const lead = Lead.parse(await req.json());
    const db = createAdminClient();
    const { error } = await db
      .from('leads')
      .upsert({ email: lead.email, source: lead.source, consent: lead.consent, list: lead.list }, { onConflict: 'email,list', ignoreDuplicates: true });
    if (error) throw error;

    if (lead.consent) await emitEvent('lead.created', lead);
    return ok({ ok: true }, 201);
  } catch (err) {
    return handleError(err, req);
  }
}
