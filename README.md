# Casino Session Tracker — backend (Supabase Edge Functions)

Server-authoritative backend for the **Casino Session Tracker**, a private single-user
Discord Activity for logging real-money casino buy-ins, cash-outs, slot denom/bet,
bonus multiples, and daily/lifetime P&L.

Companion frontend repo: `../ClaudeCode/casino-tracker` (static HTML/JS Discord Activity).

## Where it lives

Deployed **into the existing raided-hex Supabase project** (`uaoxvhihwiygrajicend`) —
its own `ct_`-prefixed tables and `ct-*` Edge Functions sit alongside raided-hex's.
This avoids the free-tier 3-project limit. The data is kept private by RLS: every
`ct_` table has **RLS enabled with no policies at all**, so only the service-role key
(held by these functions) can read or write it. raided-hex players sharing the project's
anon key get zero rows.

Identity reuses the shared `accounts` table (one Discord user = one account).

## Schema

`supabase/migrations/20260821000000_ct_init.sql` — `ct_games`, `ct_trips`,
`ct_sessions`, `ct_buyins`, `ct_bonuses`.

## Edge Functions

- **ct-auth** — Discord OAuth code exchange → find/create account → `{account, bootstrap}`.
- **ct-whoami** — session-token restore → same shape.
- **ct-data** — reads: `view` = `today` | `history` | `stats`.
- **ct-write** — all mutations, dispatched on `action` (save-session, add-buyin,
  add-bonus, save-game, save-trip, …). Returns the refreshed `today` bootstrap.

All four verify a `session_token` against `accounts` (except ct-auth which issues one).

## Secrets (set once, on the shared project)

The tracker's Discord app uses **TRACKER_-prefixed** secret names so it doesn't collide
with raided-hex's `DISCORD_*` secrets on the same project:

```bash
supabase secrets set TRACKER_DISCORD_CLIENT_ID=<your app's client id>   --project-ref uaoxvhihwiygrajicend
supabase secrets set TRACKER_DISCORD_CLIENT_SECRET=<your app's secret>  --project-ref uaoxvhihwiygrajicend
```

`SUPABASE_URL` and the service-role key are already set on the project (shared).

## Deploy

```bash
supabase link --project-ref uaoxvhihwiygrajicend --yes
# Apply the migration through the Management API (db push is unsafe on this project —
# its remote migration history is missing older local raided-hex migrations):
supabase db query --linked -f supabase/migrations/20260821000000_ct_init.sql
# Record it so a future push doesn't re-run it:
supabase db query --linked "insert into supabase_migrations.schema_migrations (version, name) values ('20260821000000','ct_init');"
# Deploy the functions:
supabase functions deploy ct-auth ct-whoami ct-data ct-write --project-ref uaoxvhihwiygrajicend
```

## Manual setup (Discord Developer Portal)

1. New Application → note **Client ID** (public, baked into the frontend), **Client
   Secret** (→ `TRACKER_DISCORD_CLIENT_SECRET`).
2. OAuth2 → add a **Redirect URI** = the frontend's GitHub Pages URL (required, or
   `commands.authorize()` throws `Missing redirect_uri` even though the embedded flow
   never redirects).
3. Activities → enable, and set **URL Mappings**:
   - root `/` → `deckofmanythings-a11y.github.io/casino-tracker/` (full path incl. subpath)
   - `/supabase` → `uaoxvhihwiygrajicend.supabase.co`
