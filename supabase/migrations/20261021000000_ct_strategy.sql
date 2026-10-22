-- Table (Other) craps strategies: a short free-text "strategy" note.
-- On ct_games it's the reusable definition (pre-fills a new session);
-- on ct_sessions it's the per-session snapshot the user logs/edits.
alter table ct_games    add column if not exists strategy text;
alter table ct_sessions add column if not exists strategy text;
