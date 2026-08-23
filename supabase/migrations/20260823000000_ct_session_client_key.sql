-- Idempotent session creation. The client sends a client_key (one per "start session"
-- action); a retried or double-submitted create with the same key returns the existing
-- session instead of inserting a duplicate. Fixes double-started sessions on flaky
-- casino wifi (slow round-trip → user taps again, or the Activity reloads mid-create).
alter table ct_sessions add column if not exists client_key text;
create unique index if not exists ct_sessions_client_key_uniq
  on ct_sessions(account_id, client_key) where client_key is not null;
