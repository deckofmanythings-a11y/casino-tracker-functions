-- Email/password auth via Supabase Auth. Link the shared `accounts` table to auth.users.
-- Additive only: raided-hex accounts keep null auth_user_id/email and are unaffected.
-- The tracker now identifies users by auth_user_id (Supabase Auth) instead of discord_id.
alter table accounts add column if not exists auth_user_id uuid unique;
alter table accounts add column if not exists email text;
create index if not exists accounts_email_idx on accounts(email);
