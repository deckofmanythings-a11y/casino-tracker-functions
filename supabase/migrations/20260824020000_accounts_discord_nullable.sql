-- New tracker users sign up with email and have no Discord identity, so discord_id
-- can no longer be required. raided-hex still always sets it, so this is safe/additive.
-- (Unique index on discord_id keeps working: Postgres allows multiple NULLs.)
alter table accounts alter column discord_id drop not null;
