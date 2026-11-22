-- Per-game "hide the display name on the Today fast-select tile" flag. For games whose art already
-- says the name, the tile shows art only; a core game with variants still shows its "N variants"
-- count. Flows into bootstrap via select('*'), so only ct-write's save-game needs to handle it.
alter table ct_games add column if not exists hide_name boolean not null default false;
