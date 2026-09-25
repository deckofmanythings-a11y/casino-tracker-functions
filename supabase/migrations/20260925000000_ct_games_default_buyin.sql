-- Optional typical buy-in for a game (e.g. a $300 table sit-down). Pre-fills the
-- opening buy-in when a session is started from this game.
alter table ct_games add column if not exists default_buyin numeric;
