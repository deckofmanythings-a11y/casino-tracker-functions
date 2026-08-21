// ct-whoami — session restore. On reload (or outside Discord, from a stored token),
// the frontend calls this with the session_token it saved from ct-auth. Returns the
// same { account, bootstrap } shape so both entry paths share one boot() on the client.
// ct_* tables have no anon read policy, so this (service-role) function is the only
// way the frontend can get its data back after a refresh.

import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { requireAccount } from '../_shared/session.ts';
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
    const today = typeof body.today === 'string' ? body.today : todayFallback();

    const supabase = createAdminClient();
    const sessionResult = await requireAccount(supabase, body.session_token);
    if ('error' in sessionResult) return json({ ok: false, message: sessionResult.error }, sessionResult.status);
    const { account } = sessionResult;

    const bootstrap = await buildBootstrap(supabase, account, today);
    return json({ ok: true, account, bootstrap });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
