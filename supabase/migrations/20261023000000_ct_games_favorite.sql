-- Favorite games surface on the Today quick-select (replacing the last-6 recent list).
alter table ct_games add column if not exists favorite boolean not null default false;
