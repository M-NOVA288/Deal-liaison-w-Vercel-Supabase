import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { siteUrl } from '@/lib/env';
import { ok, fail, handleError } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  status: z.enum(['new', 'call_booked', 'contract_sent', 'paid', 'in_progress', 'delivered', 'declined']).optional(),
  adminNotes: z.string().max(5000).optional(),
  quoteCents: z.number().int().min(5000).max(5000000).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    if (!(await requireAdmin(req))) return fail('Admins only.', 403);
    const { id } = await params;
    const body = Patch.parse(await req.json());
    const db = createAdminClient();

    const { data: request, error: getErr } = await db.from('premium_requests').select('*').eq('id', id).maybeSingle();
    if (getErr) throw getErr;
    if (!request) return fail('Request not found.', 404);

    const update: Record<string, unknown> = {};
    if (body.adminNotes !== undefined) update.admin_notes = body.adminNotes;
    if (body.status) {
      update.status = body.status;
      if (body.status === 'delivered') update.delivered_at = new Date().toISOString();
    }

    if (body.quoteCents) {
      if (request.status === 'paid') return fail('This client has already paid.', 409);
      const session = await stripe().checkout.sessions.create({
        mode: 'payment',
        customer_email: request.email,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: body.quoteCents,
            product_data: {
              name: 'Done-for-you acquisition plan',
              description: `Lender-ready acquisition plan for: ${String(request.business_description).slice(0, 200)}`,
            },
          },
        }],
        metadata: { product: 'premium_plan', premium_request_id: id, user_id: request.user_id ?? '' },
        client_reference_id: request.user_id ?? undefined,
        expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
        success_url: `${siteUrl()}/welcome?product=premium_plan`,
        cancel_url: `${siteUrl()}/`,
      });
      update.price_cents = body.quoteCents;
      update.checkout_url = session.url;
      update.stripe_session_id = session.id;
      if (!body.status) update.status = 'contract_sent';
    }

    if (!Object.keys(update).length) return fail('Nothing to update.');
    const { data, error } = await db.from('premium_requests').update(update).eq('id', id).select('*').single();
    if (error) throw error;
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
