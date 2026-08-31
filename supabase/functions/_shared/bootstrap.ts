// Builds the payload the frontend needs to render the "Today" screen in one round
// trip: the fast-select games catalog, the active bankroll trip (with its computed
// remaining), and today's sessions with their buy-ins and bonuses embedded.
//
// `today` is the client's own LOCAL calendar date (YYYY-MM-DD). The client is the
// authority on what "today" means so the daily cumulative is correct wherever the
// user is; the server just filters ct_sessions.session_date to it.
//
// Everything here uses the service-role client (RLS-bypassing) because ct_* tables
// have no anon read policies -- this is the only path that can read them.

import type { createAdminClient } from './supabaseAdmin.ts';
import type { Account } from './user.ts';

const SESSION_SELECT = '*, ct_buyins(*), ct_bonuses(*)';

function num(v: unknown): number { return Number(v || 0); }

export function sessionNet(s: { buy_in_total?: unknown; cash_out?: unknown }): number {
  return num(s.cash_out) - num(s.buy_in_total);
}

export interface TripTotals { buyins: number; cashouts: number; remaining: number; net: number; }

// Totals for the active trip = only sessions started AT/AFTER the trip began (by
// started_at timestamp), so a new trip resets "in pocket" to exactly the bankroll you
// brought and counts only that trip's play. remaining is the live cash in pocket:
// bankroll minus what's gone into machines, plus what's come back out.
export async function computeTripTotals(
  supabase: ReturnType<typeof createAdminClient>,
  accountId: string,
  trip: { starting_bankroll: unknown; started_at?: string | null },
): Promise<TripTotals> {
  let q = supabase.from('ct_sessions').select('buy_in_total, cash_out').eq('account_id', accountId);
  if (trip.started_at) q = q.gte('started_at', trip.started_at);
  const { data } = await q;
  const buyins = (data || []).reduce((s, r) => s + num(r.buy_in_total), 0);
  const cashouts = (data || []).reduce((s, r) => s + num(r.cash_out), 0);
  return { buyins, cashouts, net: cashouts - buyins, remaining: num(trip.starting_bankroll) - buyins + cashouts };
}

export async function buildBootstrap(
  supabase: ReturnType<typeof createAdminClient>,
  account: Account,
  today: string,
) {
  const [gamesRes, tripRes, sessRes] = await Promise.all([
    supabase.from('ct_games').select('*')
      .eq('account_id', account.id).eq('archived', false)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('ct_trips').select('*')
      .eq('account_id', account.id).is('ended_at', null)
      .order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('ct_sessions').select(SESSION_SELECT)
      .eq('account_id', account.id).eq('session_date', today)
      .order('started_at', { ascending: true }),
  ]);

  const active_trip = tripRes.data || null;
  const active_trip_totals = active_trip ? await computeTripTotals(supabase, account.id, active_trip) : null;

  return {
    today,
    games: gamesRes.data || [],
    active_trip,
    active_trip_totals,
    sessions: sessRes.data || [],
  };
}

export { SESSION_SELECT };
