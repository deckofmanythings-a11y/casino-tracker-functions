-- Optional manual override for a game tile's background colour. null = auto-detect
-- from the uploaded art (opaque → its own edge colour; transparent → black/white by
-- logo contrast). A 6-digit hex (e.g. '#000000') pins it instead.
alter table ct_games add column if not exists art_bg text;
