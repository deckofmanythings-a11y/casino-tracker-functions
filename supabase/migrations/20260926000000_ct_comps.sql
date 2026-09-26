-- Comp tracking. Each comp belongs to a "person" (Me/Wife/Son/…) at a casino, with an
-- eligibility window (valid_from/valid_to, either optional) + optional weekdays (dow),
-- and a single_use flag. Recurring comps track per-day use in used_dates; single-use
-- comps flip `used` once. ct_comp_casinos maps a casino -> a colour (+ optional category
-- label) so comps can be colour-coded by casino. RLS on, no policies => service-role only.
create table if not exists ct_comps (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  person text not null default 'Me',
  casino text,
  title text not null,
  notes text,
  single_use boolean not null default false,
  valid_from date,                         -- null = no start bound
  valid_to date,                           -- null = no end bound
  dow jsonb,                               -- array of weekday ints 0..6 (0=Sun); null/[] = any day
  used boolean not null default false,     -- single_use comps: redeemed for good
  used_dates jsonb not null default '[]',  -- recurring comps: dates marked used
  created_at timestamptz not null default now()
);
create index if not exists ct_comps_account_idx on ct_comps(account_id);

create table if not exists ct_comp_casinos (
  account_id uuid not null references accounts(id) on delete cascade,
  casino text not null,
  color text not null default '#c9a24e',
  category text,
  primary key (account_id, casino)
);

alter table ct_comps        enable row level security;
alter table ct_comp_casinos enable row level security;
