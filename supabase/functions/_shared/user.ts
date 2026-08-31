// Identity for the standalone web app: a Supabase Auth user (email/password) instead of
// the old Discord OAuth session_token. Every player-facing function calls this first.
//
// Validates the JWT the client sends as `Authorization: Bearer <access_token>`, then maps
// the auth user to an `accounts` row (accounts is shared with raided-hex; the tracker uses
// auth_user_id). Find-or-link order:
//   1. account already linked to this auth_user_id
//   2. account with a matching email but no link yet → adopt it (this is the one-time
//      migration path: the owner's Discord account was pre-tagged with their email)
//   3. brand-new account (new signup)

import { createAdminClient } from './supabaseAdmin.ts';

export interface Account {
  id: string;
  discord_id: string | null;
  discord_username: string | null;
  auth_user_id: string | null;
  email: string | null;
}

export async function requireUser(
  supabase: ReturnType<typeof createAdminClient>,
  req: Request,
): Promise<{ account: Account } | { error: string; status: number }> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { error: 'Not signed in.', status: 401 };

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return { error: 'Session expired — please sign in again.', status: 401 };
  const uid = userData.user.id;
  const email = userData.user.email || null;

  const { data: byUid, error: uidErr } = await supabase
    .from('accounts').select('*').eq('auth_user_id', uid).maybeSingle();
  if (uidErr) return { error: 'Account lookup failed: ' + uidErr.message, status: 500 };
  if (byUid) return { account: byUid };

  if (email) {
    const { data: byEmail } = await supabase
      .from('accounts').select('*').eq('email', email).is('auth_user_id', null).maybeSingle();
    if (byEmail) {
      const { data: linked, error: upErr } = await supabase
        .from('accounts').update({ auth_user_id: uid }).eq('id', byEmail.id).select().single();
      if (upErr) return { error: 'Account link failed: ' + upErr.message, status: 500 };
      return { account: linked };
    }
  }

  const { data: created, error: insErr } = await supabase
    .from('accounts').insert({ auth_user_id: uid, email }).select().single();
  if (insErr) return { error: 'Could not create account: ' + insErr.message, status: 500 };
  return { account: created };
}
