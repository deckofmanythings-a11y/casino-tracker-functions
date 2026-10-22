-- Table (Other) craps side-bet achievements, tracked per session as booleans:
--   craps_small = "All Small" (Smalls), craps_all = "Make 'Em All", craps_tall = "All Tall" (Talls).
alter table ct_sessions add column if not exists craps_small boolean not null default false;
alter table ct_sessions add column if not exists craps_all   boolean not null default false;
alter table ct_sessions add column if not exists craps_tall  boolean not null default false;
