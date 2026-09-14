-- Sync each bonus's machine_name to its session's current game_name. The Stats
-- leaderboard displays machine_name (a snapshot from when the bonus was logged), so a
-- session renamed in History left the leaderboard showing the old name. The session's
-- game_name is the display truth; make every bonus match it. Going forward, ct-write's
-- save-session propagates a rename to its bonuses, so this only closes the existing gap.
update ct_bonuses b
   set machine_name = s.game_name
  from ct_sessions s
 where b.session_id = s.id
   and b.machine_name is distinct from s.game_name;
