import { z } from 'zod';
import { analyzeDeal } from '@/lib/analyzer';
import { getUser } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  industry: z.string().trim().max(60).optional(),
  stage: z.enum(['reviewing', 'diligence', 'offer', 'under_contract', 'closed', 'passed']).optional(),
  notes: z.string().max(5000).optional(),
  inputs: z.record(z.unknown()).optional(),
});

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await getUser(req);
    if (!user) return fail('Please sign in.', 401);
    const { data, error } = await supabase.from('deals').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return fail('Deal not found.', 404);
    return ok(data);
  } catch (err) {
    return handleError(err, req);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await getUser(req);
    if (!user) return fail('Please sign in.', 401);

    const body = Patch.parse(await req.json());
    const update: Record<string, unknown> = {};
    for (const k of ['name', 'industry', 'stage', 'notes'] as const) if (body[k] !== undefined) update[k] = body[k];
    if (body.inputs) {
      const results = analyzeDeal(body.inputs);
      update.inputs = results.assumptions;
      update.results = results;
    }
    if (!Object.keys(update).length) return fail('Nothing to update.');

    const { data, error } = await supabase.from('deals').update(update).eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return fail('Deal not found.', 404);
    return ok(data);
  } catch (err) {
    return handleError(err, req);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await getUser(req);
    if (!user) return fail('Please sign in.', 401);
    const { data, error } = await supabase.from('deals').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) return fail('Deal not found.', 404);
    return ok({ deleted: id });
  } catch (err) {
    return handleError(err, req);
  }
}
