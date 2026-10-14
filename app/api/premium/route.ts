import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createUserClient } from '@/lib/supabase/server';
import { emitEvent } from '@/lib/automation';
import { ok, fail, handleError, rateLimited, clientIp } from '@/lib/http';

const PremiumBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  businessDescription: z.string().trim().min(10).max(3000),
  askingPrice: z.coerce.number().positive().optional(),
  financingType: z.enum(['sba', 'seller_financing', 'cash', 'other']).optional(),
  deadline: z.string().date().optional(),
});

export async function POST(req: Request) {
  if (rateLimited(`premium:${clientIp(req)}`, 5)) return fail('Too many requests.', 429);
  try {
    const body = PremiumBody.parse(await req.json());

    const supabase = await createUserClient(req.headers.get('authorization'));
    const { data: { user } } = await supabase.auth.getUser();

    const db = createAdminClient();
    const { data, error } = await db
      .from('premium_requests')
      .insert({
        user_id: user?.id ?? null,
        name: body.name,
        email: body.email,
        business_description: body.businessDescription,
        asking_price: body.askingPrice ?? null,
        financing_type: body.financingType ?? null,
        deadline: body.deadline ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;

    await emitEvent('premium.requested', { id: data.id, ...body });
    const base = process.env.CALENDLY_DEALS_URL || process.env.NEXT_PUBLIC_CALENDLY_URL;
    let bookingUrl: string | null = null;
    if (base) {
      const u = new URL(base);
      u.searchParams.set('name', body.name);
      u.searchParams.set('email', body.email);
      bookingUrl = u.toString();
    }
    return ok({ id: data.id, bookingUrl }, 201);
  } catch (err) {
    return handleError(err, req);
  }
}
