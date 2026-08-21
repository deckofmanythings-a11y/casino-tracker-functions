// ct-auth — Discord Activity entry point for the Casino Session Tracker.
//
// Exchanges the Discord OAuth `code` for a verified identity, finds-or-creates the
// matching `accounts` row (shared with raided-hex, keyed on discord_id), issues a
// session_token, and returns the "Today" bootstrap so the app can render immediately.
//
// NOTE: reads TRACKER_DISCORD_CLIENT_ID / TRACKER_DISCORD_CLIENT_SECRET, not the
// bare DISCORD_* names — those belong to raided-hex's own app on this shared project.

import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { findOrCreateAccount } from '../_shared/account.ts';
import { buildBootstrap } from '../_shared/bootstrap.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function todayFallback(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    .toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const { code } = body;
    const today = typeof body.today === 'string' ? body.today : todayFallback();
    if (!code) return json({ ok: false, message: 'Missing OAuth code.' }, 400);

    const clientId = Deno.env.get('TRACKER_DISCORD_CLIENT_ID');
    const clientSecret = Deno.env.get('TRACKER_DISCORD_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return json({ ok: false, message: 'Tracker Discord OAuth is not configured on the server.' }, 500);
    }

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }),
    });
    if (!tokenRes.ok) return json({ ok: false, message: 'Discord rejected the OAuth code.' }, 401);
    const { access_token } = await tokenRes.json();

    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) return json({ ok: false, message: 'Could not fetch Discord identity.' }, 401);
    const me = await meRes.json();

    const supabase = createAdminClient();
    const account = await findOrCreateAccount(supabase, me.id, me.global_name || me.username, true);
    const bootstrap = await buildBootstrap(supabase, account, today);

    return json({ ok: true, account, bootstrap });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
