import { getUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok, fail, handleError } from '@/lib/http';

const FILE = process.env.PLAYBOOK_FILE_PATH || 'deal-playbook.pdf';

export async function GET(req: Request) {
  try {
    const { user } = await getUser(req);
    if (!user) return fail('Please sign in with the email you used at checkout.', 401);

    const db = createAdminClient();
    const { data: profile } = await db.from('profiles').select('has_playbook').eq('id', user.id).single();
    if (!profile?.has_playbook) return fail('No playbook purchase found for this account.', 403);

    const { data, error } = await db.storage.from('playbook').createSignedUrl(FILE, 600, { download: true });
    if (error) throw error;
    return ok({ url: data.signedUrl, expiresInSeconds: 600 });
  } catch (err) {
    return handleError(err, req);
  }
}
