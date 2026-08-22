-- Bankroll = live "cash in pocket". A trip's totals are now computed over the whole
-- visit — every session dated on/after the trip's start_date — instead of only sessions
-- that happened to carry its trip_id. That way setting a bankroll always reflects the
-- day's play, even sessions started before the bankroll was set. start_date is the
-- client's LOCAL calendar date at trip creation (matches ct_sessions.session_date).
alter table ct_trips add column if not exists start_date date;
update ct_trips set start_date = (started_at at time zone 'America/Los_Angeles')::date
  where start_date is null;
alter table ct_trips alter column start_date
  set default (now() at time zone 'America/Los_Angeles')::date;
