import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Runs before every request:
 *  1. CORS for /api/* so your Framer site (a different domain) can call this backend.
 *     Set ALLOWED_ORIGINS="https://yourbrand.com,https://www.yourbrand.com".
 *     The Stripe webhook is excluded (Stripe calls it server-to-server).
 *  2. Refreshes the Supabase login cookie so users stay signed in.
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

  if (isApi && req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: cors });

  let res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key && !isWebhook) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser(); // refreshes the session if needed
  }

  Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
