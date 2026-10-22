-- Free-text per-casino notes (e.g. "Aces high pays poorly on Pai Gow here",
-- "$2 Progressive on UTH", whether they have Bubble or Stadium craps).
alter table ct_comp_casinos add column if not exists notes text;
