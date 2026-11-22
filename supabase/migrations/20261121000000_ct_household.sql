-- Household members the user tracks comps for (Me, spouse, kids…). A small, ordered, synced list
-- managed in the app's Settings screen; the Comps "Person" field is a dropdown of these names.
-- comp.person stays a free-text snapshot (a member can be renamed/removed without touching old
-- comps). RLS on, no policies => service-role (edge functions) only.
create table if not exists ct_household (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ct_household_account_idx on ct_household(account_id);

alter table ct_household enable row level security;
