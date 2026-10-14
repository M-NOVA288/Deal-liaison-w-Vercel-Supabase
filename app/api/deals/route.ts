import { z } from 'zod';
import { analyzeDeal } from '@/lib/analyzer';
import { createUserClient } from '@/lib/supabase/server';
import { ok, fail, handleError } from '@/lib/http';

const SaveDeal = z.object({
  name: z.string().trim().min(1).max(120),
  industry: z.string().trim().max(60).optional(),
  stage: z.enum(['reviewing', 'diligence', 'offer', 'under_contract', 'closed', 'passed']).default('reviewing'),
  notes: z.string().max(5000).optional(),
  inputs: z.record(z.unknown()),
});

export async function GET(req: Request) {
  try {
    const supabase = await createUserClient(req.headers.get('authorization'));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('Please sign in.', 401);

    const { data, error } = await supabase
      .from('deals')
      .select('id, name, industry, stage, results, notes, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return ok({ deals: data });
  } catch (err) {
    return handleError(err, req);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createUserClient(req.headers.get('authorization'));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('Please sign in.', 401);

    const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
    if (profile?.plan !== 'pro') return fail('Saving deals is a Pro feature.', 402);

    const body = SaveDeal.parse(await req.json());
    const results = analyzeDeal(body.inputs);

    const { data, error } = await supabase
      .from('deals')
      .insert({
        user_id: user.id,
        name: body.name,
        industry: body.industry,
        stage: body.stage,
        notes: body.notes,
        inputs: results.assumptions,
        results,
      })
      .select('id')
      .single();
    if (error) throw error;
    return ok({ id: data.id, results }, 201);
  } catch (err) {
    return handleError(err, req);
  }
}
