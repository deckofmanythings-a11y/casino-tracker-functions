-- Casino Session Tracker schema.
--
-- All tables are ct_-prefixed and live INSIDE the shared raided-hex Supabase
-- project (uaoxvhihwiygrajicend), alongside the game's tables. This is private
-- financial data, so RLS is enabled with NO policies at all: anon/authenticated
-- roles get zero rows, and only the service-role key held by the ct-* Edge
-- Functions can read or write. That keeps the ledger unreadable to raided-hex
-- players who share the same project + anon key.
--
-- Identity reuses the existing `accounts` table (accounts.id), same as raided-hex,
-- so a Discord user is one account whether they're raiding or tracking buy-ins.

-- Fast-select catalog: the games/machines you play, surfaced as one-tap buttons.
create table if not exists ct_games (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  category text not null default 'slot'
    check (category in ('slot','table','video_poker','other')),
  default_denom numeric,   -- credit value, e.g. 0.01, 0.25, 1
  default_bet numeric,     -- base bet ($/spin), e.g. 1.25, 2.50
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ct_games_account_idx on ct_games(account_id);

-- Optional trip grouping for bankroll tracking (start with $X, watch it deplete).
create table if not exists ct_trips (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  casino text,
  starting_bankroll numeric not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,    -- null = active trip
  created_at timestamptz not null default now()
);
create index if not exists ct_trips_account_idx on ct_trips(account_id);

-- One sit-down at one machine/table. cash_out null => session still open/active.
-- session_date is the "gambling day" this counts toward; the client passes its own
-- local calendar date so the daily cumulative is correct regardless of DB timezone.
-- The Pacific default is only a fallback for rows created without one.
create table if not exists ct_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  trip_id uuid references ct_trips(id) on delete set null,
  game_id uuid references ct_games(id) on delete set null,
  game_name text not null,
  category text not null default 'slot'
    check (category in ('slot','table','video_poker','other')),
  casino text,
  denom numeric,
  bet_size numeric,
  buy_in_total numeric not null default 0,   -- maintained server-side = sum(ct_buyins)
  cash_out numeric,                          -- null = still open
  notes text,
  session_date date not null default (now() at time zone 'America/Los_Angeles')::date,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ct_sessions_account_date_idx on ct_sessions(account_id, session_date);
create index if not exists ct_sessions_trip_idx on ct_sessions(trip_id);

-- Itemized buy-in / re-buy events, so a mistaken re-buy can be undone individually.
create table if not exists ct_buyins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references ct_sessions(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  amount numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists ct_buyins_session_idx on ct_buyins(session_id);

-- Slot bonus hits. `multiple` (= amount / base_bet) is the headline number the app
-- is built around. is_jackpot auto-flags W-2G-reportable hand pays (>= $1,200).
create table if not exists ct_bonuses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references ct_sessions(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  amount numeric not null,     -- bonus payout
  base_bet numeric,            -- bet at time of hit (snapshot from session, editable)
  multiple numeric,            -- amount / base_bet
  is_jackpot boolean not null default false,
  machine_name text,
  created_at timestamptz not null default now()
);
create index if not exists ct_bonuses_session_idx on ct_bonuses(session_id);
create index if not exists ct_bonuses_account_idx on ct_bonuses(account_id);

-- Lock everything down: RLS on, zero policies => service-role only.
alter table ct_games    enable row level security;
alter table ct_trips    enable row level security;
alter table ct_sessions enable row level security;
alter table ct_buyins   enable row level security;
alter table ct_bonuses  enable row level security;
