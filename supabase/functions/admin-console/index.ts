import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createHandler } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const options = { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url: RequestInfo | URL, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) }) } };
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
Deno.serve(createHandler({ service,
  userClient: (token: string) => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    ...options, global: { ...options.global, headers: { Authorization: `Bearer ${token}` } }
  }),
  allowedOrigins: (Deno.env.get('ADMIN_CONSOLE_ORIGINS') || 'https://simpicdecdel.github.io').split(','),
  recoveryUrl: Deno.env.get('ADMIN_CONSOLE_RECOVERY_URL') || 'https://simpicdecdel.github.io/plumbing-commissioning-app/'
}));
