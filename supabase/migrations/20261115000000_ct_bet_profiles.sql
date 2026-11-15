-- User-defined Attack Ladder bet profiles. A "bet profile" captures one credit-based machine's
-- bet menu: a list of tiers, each tier = a set of denominations that share a set of credit "bet
-- levels" (dollar bet = denom × credits). The client rebuilds the Attack Ladder for a profile by
-- mapping each rung's target bet to the closest achievable denom×credits. Three profiles ship in
-- the client code (flaming_pots, mystery_lamp, frightful_fortunes); THIS table holds the ones the
-- user builds in-app, so they sync across devices. `key` is the stable handle games reference in
-- ct_games.bet_profile (client-generated, e.g. "u_hotpots_a1b2"); unique per account.
-- RLS on, no policies => service-role (edge functions) only.
create table if not exists ct_bet_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  key text not null,                       -- stable handle used by ct_games.bet_profile
  label text not null,                     -- machine name shown in the UI
  short text,                              -- short label for the ladder pill (defaults to label)
  note text,                               -- optional guidance shown under the rung
  tiers jsonb not null default '[]',       -- [{denoms:[0.01,0.02], levels:[75,150,225,375,750]}, …]
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ct_bet_profiles_account_idx on ct_bet_profiles(account_id);
create unique index if not exists ct_bet_profiles_account_key_idx on ct_bet_profiles(account_id, key);

alter table ct_bet_profiles enable row level security;
