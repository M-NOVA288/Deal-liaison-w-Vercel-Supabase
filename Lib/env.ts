/** Reads a required env var at call time, with a clear error if it's missing. */
export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}. See .env.example.`);
  return v;
}

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
