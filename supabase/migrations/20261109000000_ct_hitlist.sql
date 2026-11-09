-- Hit List (a.k.a. Scavenger Hunt): a personal checklist of games the user wants to play on
-- a trip or across a few sessions. NOT tied to a casino or a day. Each row names a game
-- (soft-linked to ct_games by game_id, plus a snapshot of name/category so it survives the
-- game being removed) and optionally carries challenges (jsonb array of {id,text,done}) —
-- "Get a straight flush", "Triple pop bonus", etc. A row is complete when it has no open
-- challenges: either every challenge is done, or (no challenges) the manual `done` flag is
-- set. RLS on, no policies => service-role only.
create table if not exists ct_hitlist (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  game_id uuid references ct_games(id) on delete set null,  -- soft link; the game may be removed
  game_name text not null,                                  -- snapshot for display
  category text,                                            -- snapshot for the tile icon
  challenges jsonb not null default '[]',                   -- [{id,text,done}]
  done boolean not null default false,                      -- manual completion (no-challenge items)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ct_hitlist_account_idx on ct_hitlist(account_id);

alter table ct_hitlist enable row level security;
