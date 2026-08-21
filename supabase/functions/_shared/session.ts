// Shared session validation. Every player-facing Edge Function (other than ct-auth
// itself) calls this first, before touching any ledger data. Mirrors raided-hex /
// the casino's session_token pattern: a random bearer token issued by ct-auth,
// checked against accounts.session_token + accounts.session_expires on every request.
// Copied from raided-hex-functions/supabase/functions/_shared/session.ts.

import { createAdminClient } from './supabaseAdmin.ts';

export interface Account {
  id: string;
  discord_id: string;
  discord_username: string | null;
  session_token: string | null;
  session_expires: string | null;
}

export async function requireAccount(
  supabase: ReturnType<typeof createAdminClient>,
  sessionToken: unknown,
): Promise<{ account: Account } | { error: string; status: number }> {
  if (!sessionToken || typeof sessionToken !== 'string') {
    return { error: 'Missing session_token.', status: 401 };
  }

  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, discord_id, discord_username, session_token, session_expires')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (error) return { error: 'Session lookup failed: ' + error.message, status: 500 };
  if (!account) return { error: 'Invalid session.', status: 401 };
  if (!account.session_expires || new Date(account.session_expires).getTime() < Date.now()) {
    return { error: 'Session expired.', status: 401 };
  }

  return { account };
}
