-- Staking: I front a player a stake, and later they return some amount. I only ever
-- recover UP TO my stake (never profit off them); they keep anything above it. So my
-- net on a stake is min(0, returned - stake_amount) and the player's own winnings are
-- max(0, returned - stake_amount). `returned` null => the stake is still out.
--
-- Parallel to ct_trips (bankroll): same account scoping, same lockdown. RLS on with
-- NO policies => service-role (ct-* functions) only; unreadable to raided-hex players.
create table if not exists ct_stakes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  person text not null,
  casino text,
  stake_amount numeric not null default 0,   -- my money out (the stake)
  returned numeric,                          -- what they handed back; null = still out
  notes text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,                      -- set when `returned` is recorded
  created_at timestamptz not null default now()
);
create index if not exists ct_stakes_account_idx on ct_stakes(account_id);

alter table ct_stakes enable row level security; -- zero policies => service-role only
