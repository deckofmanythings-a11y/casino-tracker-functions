-- "Other" category is retired — fold it into 'bubble_craps' (shown as "Table (Other)"),
-- which the user considers the catch-all. Convert any existing rows so nothing is
-- orphaned once the UI stops offering 'other'. The CHECK constraint still permits
-- 'other', so no constraint change is needed.
update ct_games    set category = 'bubble_craps' where category = 'other';
update ct_sessions set category = 'bubble_craps' where category = 'other';
