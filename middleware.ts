import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Runs before every request:
 *  1. CORS for /api/* so your Framer site (a different domain) can call this backend.
 *     Set ALLOWED_ORIGINS="https://yourbrand.com,https://www.yourbrand.com".
 *     The Stripe webhook is excluded (Stripe calls it server-to-server).
 *  2. Refreshes the Supabase login cookie so users stay signed in.
 *  3. Tags every request with an x-request-id (kept if the caller sent one) and returns it in the
 *     response, so a user's error report can be matched to the exact log lines.
 */
const allowed = () =>
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .concat(process.env.NEXT_PUBLIC_SITE_URL ? [process.env.NEXT_PUBLIC_SITE_URL] : []);

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowed().includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function middleware(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith('/api/');
  const isWebhook = req.nextUrl.pathname.startsWith('/api/webhooks/');
  const cors = isApi && !isWebhook ? corsHeaders(req.headers.get('origin')) : {};

  const id = req.headers.get('x-request-id') || crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set('x-request-id', id);

  if (isApi && req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: { ...cors, 'x-request-id': id } });

  let res = NextResponse.next({ request: { headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key && !isWebhook && req.nextUrl.pathname !== '/api/health') {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: { headers } });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser(); // refreshes the session if needed
  }

  Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
  res.headers.set('x-request-id', id);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
