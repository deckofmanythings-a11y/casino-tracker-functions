// Finds or creates the accounts row for a Discord identity. The casino tracker
// reuses the SAME `accounts` table as raided-hex (one Discord user = one account),
// so this is copied from raided-hex-functions/supabase/functions/_shared/account.ts.
// Only ct-auth calls it (after a verified Discord OAuth code exchange), always with
// issueSession=true since the Activity frontend must send the token back every call.

import { createAdminClient } from './supabaseAdmin.ts';

export interface Account {
  id: string;
  discord_id: string;
  discord_username: string | null;
  session_token: string | null;
  session_expires: string | null;
}

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newExpiry(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export async function findOrCreateAccount(
  supabase: ReturnType<typeof createAdminClient>,
  discordId: string,
  discordUsername: string,
  issueSession = true,
): Promise<Account> {
  const { data: existing, error: findErr } = await supabase
    .from('accounts').select('*').eq('discord_id', discordId).maybeSingle();
  if (findErr) throw new Error('Account lookup failed: ' + findErr.message);

  if (existing) {
    if (!issueSession) return existing;
    const token = generateToken();
    const expires = newExpiry();
    const { data: updated, error: updErr } = await supabase
      .from('accounts')
      .update({ session_token: token, session_expires: expires, discord_username: discordUsername })
      .eq('id', existing.id)
      .select()
      .single();
    if (updErr) throw new Error('Session update failed: ' + updErr.message);
    return updated;
  }

  const insertRow: Record<string, unknown> = { discord_id: discordId, discord_username: discordUsername };
  if (issueSession) {
    insertRow.session_token = generateToken();
    insertRow.session_expires = newExpiry();
  }
  const { data: created, error: insErr } = await supabase
    .from('accounts').insert(insertRow).select().single();
  if (insErr) throw new Error('Could not create account: ' + insErr.message);
  return created;
}
