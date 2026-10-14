import { NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (code) {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${siteUrl()}${safeNext}`);
  }
  return NextResponse.redirect(`${siteUrl()}/?auth=failed`);
}
