-- Add 'bubble_craps' as its own category (electronic craps machines deal in cents like
-- slots/video poker). Widen the category check on both ct_games and ct_sessions.
alter table ct_games drop constraint if exists ct_games_category_check;
alter table ct_games add constraint ct_games_category_check
  check (category in ('slot','video_poker','bubble_craps','table','other'));

alter table ct_sessions drop constraint if exists ct_sessions_category_check;
alter table ct_sessions add constraint ct_sessions_category_check
  check (category in ('slot','video_poker','bubble_craps','table','other'));
