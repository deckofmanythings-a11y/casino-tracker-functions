-- Attack Ladder bet structure per game. 0 = standard. 88 = "88-credit game" (Dancing Drums,
-- Hot Pot, 88 Fortunes and the rest of that family), where the minimum qualifying bet is 88
-- credits: the ladder for these games bets 88 credits and scales via the denomination instead.
alter table ct_games add column if not exists credit_min int not null default 0;
