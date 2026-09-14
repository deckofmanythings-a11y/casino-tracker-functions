-- One-time backfill: sync the denormalized names on historical rows to the current
-- game-catalog name, so Stats reflects games that were renamed in the Games tab.
--
-- ct_sessions.game_name and ct_bonuses.machine_name are snapshots taken when the row
-- was created; renaming a ct_games entry never touched them, so the leaderboard and
-- net-by-game kept the old (or slightly-differently-spelled) names. Scoped to sessions
-- that actually reference a catalog game (game_id not null). Going forward, ct-write's
-- save-game propagates renames, so this only closes the existing gap.

update ct_sessions s
   set game_name = g.name
  from ct_games g
 where s.game_id = g.id
   and s.game_name is distinct from g.name;

update ct_bonuses b
   set machine_name = g.name
  from ct_sessions s
  join ct_games g on s.game_id = g.id
 where b.session_id = s.id
   and b.machine_name is distinct from g.name;
