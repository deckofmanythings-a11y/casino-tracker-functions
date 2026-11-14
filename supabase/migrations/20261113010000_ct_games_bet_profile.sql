-- Per-game Attack Ladder bet profile for credit-based machines (Super Hot Flaming Pots, Mystery of
-- the Lamp, …). null / 'standard' = the standard ladder. Other values are profile keys the client
-- maps to a real machine's denom→credit-level bet menu. Supersedes the earlier credit_min flag,
-- which the client still reads as a fallback (credit_min 88 → 'flaming_pots').
alter table ct_games add column if not exists bet_profile text;
