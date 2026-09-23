-- Optional variant of a game's core title (e.g. core "Dragon Link", variant
-- "Happy & Prosperous"). Displayed as "Core — Variant" and snapshotted onto sessions.
alter table ct_games add column if not exists variant text;
