// ct-write — every mutation for the tracker, dispatched on `action` after a single
// session check. Returns a fresh "today" bootstrap so one call both mutates state and
// hands back the refreshed Today screen (day totals, active-trip remaining, etc.).
//
// Ownership: every row carries account_id; each action scopes its query to the
// authenticated account, so one user can never touch another's ledger even though
// all rows live in the shared project.

import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { requireUser, type Account } from '../_shared/user.ts';
import { buildBootstrap } from '../_shared/bootstrap.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

type DB = ReturnType<typeof createAdminClient>;
const W2G_THRESHOLD = 1200; // IRS W-2G hand-pay reporting threshold for slots.
const CATEGORIES = ['slot', 'video_poker', 'bubble_craps', 'table', 'other'];

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Confirms a session belongs to the account; returns it or null.
async function ownSession(supabase: DB, accountId: string, sessionId: unknown) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const { data } = await supabase.from('ct_sessions').select('*')
    .eq('id', sessionId).eq('account_id', accountId).maybeSingle();
  return data;
}

// Recomputes buy_in_total from the itemized ct_buyins rows.
async function recomputeBuyIn(supabase: DB, sessionId: string): Promise<number> {
  const { data } = await supabase.from('ct_buyins').select('amount').eq('session_id', sessionId);
  const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  await supabase.from('ct_sessions').update({ buy_in_total: total }).eq('id', sessionId);
  return total;
}

async function handle(action: string, body: Record<string, unknown>, supabase: DB, account: Account) {
  switch (action) {
    // ── Sessions ──────────────────────────────────────────────────────────
    case 'save-session': {
      const category = CATEGORIES.includes(body.category as string) ? body.category : 'slot';
      const fields: Record<string, unknown> = {
        game_name: (body.game_name as string || '').trim() || 'Untitled',
        category,
        game_id: body.game_id || null,
        trip_id: body.trip_id || null,
        casino: (body.casino as string) || null,
        denom: numOrNull(body.denom),
        bet_size: numOrNull(body.bet_size),
        notes: (body.notes as string) ?? null,
      };
      if (body.id) {
        const existing = await ownSession(supabase, account.id, body.id);
        if (!existing) return { error: 'Session not found.', status: 404 };
        // Only overwrite fields actually provided (partial edit).
        const patch: Record<string, unknown> = {};
        for (const k of ['game_name', 'category', 'game_id', 'trip_id', 'casino', 'denom', 'bet_size', 'notes']) {
          if (k in body) patch[k] = fields[k];
        }
        if ('cash_out' in body) {
          const co = numOrNull(body.cash_out);
          patch.cash_out = co;
          patch.ended_at = co === null ? null : new Date().toISOString();
        }
        await supabase.from('ct_sessions').update(patch).eq('id', body.id as string);
        return { ok: true };
      }
      // Create
      const clientKey = typeof body.client_key === 'string' ? body.client_key : null;
      // Idempotency: a retried/double create with the same client_key returns the
      // session already made instead of inserting a duplicate.
      if (clientKey) {
        const { data: dup } = await supabase.from('ct_sessions').select('id')
          .eq('account_id', account.id).eq('client_key', clientKey).maybeSingle();
        if (dup) return { ok: true, created_session_id: dup.id, deduped: true };
      }
      const insert: Record<string, unknown> = { ...fields, account_id: account.id, client_key: clientKey };
      if (typeof body.session_date === 'string') insert.session_date = body.session_date;
      if ('cash_out' in body) {
        const co = numOrNull(body.cash_out);
        insert.cash_out = co;
        if (co !== null) insert.ended_at = new Date().toISOString();
      }
      const { data: created, error } = await supabase.from('ct_sessions').insert(insert).select().single();
      if (error) {
        // Unique-index race: a concurrent insert with the same key won — return that one.
        if (error.code === '23505' && clientKey) {
          const { data: dup } = await supabase.from('ct_sessions').select('id')
            .eq('account_id', account.id).eq('client_key', clientKey).maybeSingle();
          if (dup) return { ok: true, created_session_id: dup.id, deduped: true };
        }
        return { error: error.message, status: 400 };
      }
      // Optional opening buy-in in the same call.
      const openingBuyIn = numOrNull(body.buy_in);
      if (openingBuyIn !== null) {
        await supabase.from('ct_buyins').insert({ session_id: created.id, account_id: account.id, amount: openingBuyIn });
        await recomputeBuyIn(supabase, created.id);
      }
      return { ok: true, created_session_id: created.id };
    }

    case 'delete-session': {
      const s = await ownSession(supabase, account.id, body.id);
      if (!s) return { error: 'Session not found.', status: 404 };
      await supabase.from('ct_sessions').delete().eq('id', s.id); // cascades to buyins/bonuses
      return { ok: true };
    }

    // ── Buy-ins ───────────────────────────────────────────────────────────
    case 'add-buyin': {
      const s = await ownSession(supabase, account.id, body.session_id);
      if (!s) return { error: 'Session not found.', status: 404 };
      const amount = numOrNull(body.amount);
      if (amount === null) return { error: 'Invalid amount.', status: 400 };
      await supabase.from('ct_buyins').insert({ session_id: s.id, account_id: account.id, amount });
      await recomputeBuyIn(supabase, s.id);
      return { ok: true };
    }

    case 'delete-buyin': {
      const { data: row } = await supabase.from('ct_buyins').select('id, session_id')
        .eq('id', body.id as string).eq('account_id', account.id).maybeSingle();
      if (!row) return { error: 'Buy-in not found.', status: 404 };
      await supabase.from('ct_buyins').delete().eq('id', row.id);
      await recomputeBuyIn(supabase, row.session_id);
      return { ok: true };
    }

    // ── Bonuses ───────────────────────────────────────────────────────────
    case 'add-bonus': {
      const s = await ownSession(supabase, account.id, body.session_id);
      if (!s) return { error: 'Session not found.', status: 404 };
      const amount = numOrNull(body.amount);
      if (amount === null) return { error: 'Invalid bonus amount.', status: 400 };
      const base_bet = numOrNull(body.base_bet) ?? numOrNull(s.bet_size);
      const multiple = base_bet && base_bet > 0 ? amount / base_bet : null;
      const is_jackpot = typeof body.is_jackpot === 'boolean' ? body.is_jackpot : amount >= W2G_THRESHOLD;
      await supabase.from('ct_bonuses').insert({
        session_id: s.id, account_id: account.id, amount, base_bet, multiple, is_jackpot,
        machine_name: (body.machine_name as string) || s.game_name || null,
      });
      return { ok: true };
    }

    case 'delete-bonus': {
      const { data: row } = await supabase.from('ct_bonuses').select('id')
        .eq('id', body.id as string).eq('account_id', account.id).maybeSingle();
      if (!row) return { error: 'Bonus not found.', status: 404 };
      await supabase.from('ct_bonuses').delete().eq('id', row.id);
      return { ok: true };
    }

    // ── Games (fast-select catalog) ─────────────────────────────────────────
    case 'save-game': {
      const category = CATEGORIES.includes(body.category as string) ? body.category : 'slot';
      const fields: Record<string, unknown> = {
        name: (body.name as string || '').trim(),
        category,
        default_denom: numOrNull(body.default_denom),
        default_bet: numOrNull(body.default_bet),
      };
      // Only accept image_url when present in the payload; '' clears it. Must be a URL in
      // our own storage bucket (don't let arbitrary URLs be stored).
      if ('image_url' in body) {
        const url = typeof body.image_url === 'string' ? body.image_url.trim() : '';
        fields.image_url = url && url.includes('/storage/v1/object/public/ct-game-art/') ? url : null;
      }
      if (!fields.name) return { error: 'Game needs a name.', status: 400 };
      if (body.id) {
        const { data } = await supabase.from('ct_games').select('id').eq('id', body.id as string).eq('account_id', account.id).maybeSingle();
        if (!data) return { error: 'Game not found.', status: 404 };
        await supabase.from('ct_games').update(fields).eq('id', body.id as string);
      } else {
        const { count } = await supabase.from('ct_games').select('id', { count: 'exact', head: true }).eq('account_id', account.id);
        await supabase.from('ct_games').insert({ ...fields, account_id: account.id, sort_order: count || 0 });
      }
      return { ok: true };
    }

    case 'delete-game': {
      // Soft-archive so existing sessions that reference it keep their game_id.
      const { data } = await supabase.from('ct_games').select('id').eq('id', body.id as string).eq('account_id', account.id).maybeSingle();
      if (!data) return { error: 'Game not found.', status: 404 };
      await supabase.from('ct_games').update({ archived: true }).eq('id', data.id);
      return { ok: true };
    }

    case 'reorder-games': {
      const ids = Array.isArray(body.ids) ? body.ids as string[] : [];
      await Promise.all(ids.map((id, i) =>
        supabase.from('ct_games').update({ sort_order: i }).eq('id', id).eq('account_id', account.id)));
      return { ok: true };
    }

    // ── Trips (bankroll) ────────────────────────────────────────────────────
    case 'save-trip': {
      const fields = {
        name: (body.name as string || '').trim() || 'Trip',
        casino: (body.casino as string) || null,
        starting_bankroll: numOrNull(body.starting_bankroll) ?? 0,
      };
      if (body.id) {
        const { data } = await supabase.from('ct_trips').select('id').eq('id', body.id as string).eq('account_id', account.id).maybeSingle();
        if (!data) return { error: 'Trip not found.', status: 404 };
        await supabase.from('ct_trips').update(fields).eq('id', body.id as string);
      } else {
        const insert: Record<string, unknown> = { ...fields, account_id: account.id };
        if (typeof body.start_date === 'string') insert.start_date = body.start_date; // client's local date
        await supabase.from('ct_trips').insert(insert);
      }
      return { ok: true };
    }

    case 'close-trip': {
      const { data } = await supabase.from('ct_trips').select('id').eq('id', body.id as string).eq('account_id', account.id).maybeSingle();
      if (!data) return { error: 'Trip not found.', status: 404 };
      await supabase.from('ct_trips').update({ ended_at: new Date().toISOString() }).eq('id', data.id);
      return { ok: true };
    }

    default:
      return { error: 'Unknown action: ' + action, status: 400 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createAdminClient();
    const userResult = await requireUser(supabase, req);
    if ('error' in userResult) return json({ ok: false, message: userResult.error }, userResult.status);
    const { account } = userResult;

    const result = await handle(String(body.action || ''), body, supabase, account);
    if ('error' in result) return json({ ok: false, message: result.error }, result.status || 400);

    // Every successful mutation returns the refreshed Today bootstrap so the client
    // updates all derived totals in the same round trip.
    const today = typeof body.today === 'string' ? body.today : new Date().toISOString().slice(0, 10);
    const bootstrap = await buildBootstrap(supabase, account, today);
    return json({ ...result, bootstrap });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
