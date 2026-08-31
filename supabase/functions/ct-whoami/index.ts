// ct-whoami — called right after the Supabase Auth session is established (and on reload).
// Ensures the account exists for the signed-in user and returns the "today" bootstrap.
// ct_* tables have no anon read policy, so this (service-role) function is the only way
// the frontend gets its data.

import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { requireUser } from '../_shared/user.ts';
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
    const userResult = await requireUser(supabase, req);
    if ('error' in userResult) return json({ ok: false, message: userResult.error }, userResult.status);
    const { account } = userResult;

    const bootstrap = await buildBootstrap(supabase, account, today);
    return json({ ok: true, account, bootstrap });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
