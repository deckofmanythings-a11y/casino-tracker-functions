// ct-data — read endpoint for the tracker. One function, three views (`view` field):
//   • today   — same bootstrap as ct-auth/ct-whoami (refresh the Today screen)
//   • history — recent sessions (with buy-ins + bonuses) newest first; client groups by day
//   • stats   — lifetime aggregates + the W-2G jackpot list
// All reads use the service-role client because ct_* tables have no anon read policy.

import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { requireUser } from '../_shared/user.ts';
import { buildBootstrap, sessionNet, SESSION_SELECT } from '../_shared/bootstrap.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function num(v: unknown): number { return Number(v || 0); }

const HISTORY_LIMIT = 400;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createAdminClient();
    const userResult = await requireUser(supabase, req);
    if ('error' in userResult) return json({ ok: false, message: userResult.error }, userResult.status);
    const { account } = userResult;
    const view = body.view || 'today';

    if (view === 'today') {
      const today = typeof body.today === 'string' ? body.today : new Date().toISOString().slice(0, 10);
      const bootstrap = await buildBootstrap(supabase, account, today);
      return json({ ok: true, bootstrap });
    }

    if (view === 'history') {
      const { data, error } = await supabase.from('ct_sessions').select(SESSION_SELECT)
        .eq('account_id', account.id)
        .order('session_date', { ascending: false })
        .order('started_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) return json({ ok: false, message: error.message }, 500);
      return json({ ok: true, sessions: data || [] });
    }

    if (view === 'stats') {
      // Closed sessions (cash_out set) drive net/win/loss; open ones only count
      // toward "total bought in" so an in-progress session doesn't skew results.
      const { data: sessions, error: sErr } = await supabase.from('ct_sessions')
        .select('game_name, casino, category, buy_in_total, cash_out')
        .eq('account_id', account.id);
      if (sErr) return json({ ok: false, message: sErr.message }, 500);

      const { data: jackpots, error: jErr } = await supabase.from('ct_bonuses')
        .select('amount, multiple, machine_name, base_bet, created_at, is_jackpot, ct_sessions(game_name, casino, session_date)')
        .eq('account_id', account.id).eq('is_jackpot', true)
        .order('created_at', { ascending: false });
      if (jErr) return json({ ok: false, message: jErr.message }, 500);

      const { data: allBonuses, error: bErr } = await supabase.from('ct_bonuses')
        .select('amount, multiple, machine_name, base_bet, is_jackpot, created_at, ct_sessions(game_name, casino, session_date)')
        .eq('account_id', account.id);
      if (bErr) return json({ ok: false, message: bErr.message }, 500);

      const closed = (sessions || []).filter((s) => s.cash_out !== null && s.cash_out !== undefined);
      const lifetime_net = closed.reduce((sum, s) => sum + sessionNet(s), 0);
      const total_bought_in = (sessions || []).reduce((sum, s) => sum + num(s.buy_in_total), 0);
      const total_cashed_out = closed.reduce((sum, s) => sum + num(s.cash_out), 0);

      const nets = closed.map(sessionNet);
      const biggest_win = nets.length ? Math.max(...nets) : 0;
      const biggest_loss = nets.length ? Math.min(...nets) : 0;

      const groupBy = (key: 'game_name' | 'casino') => {
        const map: Record<string, { net: number; count: number; bought_in: number }> = {};
        for (const s of closed) {
          const k = (s[key] as string) || (key === 'casino' ? 'Unspecified' : 'Unknown');
          if (!map[k]) map[k] = { net: 0, count: 0, bought_in: 0 };
          map[k].net += sessionNet(s);
          map[k].count += 1;
          map[k].bought_in += num(s.buy_in_total);
        }
        return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.net - a.net);
      };

      // All-time bonus leaderboard: biggest hits by base-bet multiple, with context.
      // The client paginates this (3 → 10 → 20 …), so return the full ranked list
      // (bounded to keep the payload sane).
      const top_bonuses = (allBonuses || [])
        .filter((b) => b.multiple !== null && b.multiple !== undefined)
        .sort((a, b) => num(b.multiple) - num(a.multiple))
        .slice(0, 200);
      const biggest_bonus = top_bonuses[0] || null;
      const total_bonus_won = (allBonuses || []).reduce((sum, b) => sum + num(b.amount), 0);

      return json({
        ok: true,
        stats: {
          lifetime_net,
          total_bought_in,
          total_cashed_out,
          session_count: closed.length,
          open_count: (sessions || []).length - closed.length,
          biggest_win,
          biggest_loss,
          biggest_bonus,
          total_bonus_won,
          bonus_count: (allBonuses || []).length,
          by_game: groupBy('game_name'),
          by_casino: groupBy('casino'),
          jackpots: jackpots || [],
          top_bonuses,
        },
      });
    }

    return json({ ok: false, message: 'Unknown view: ' + view }, 400);
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
