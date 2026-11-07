\set ON_ERROR_STOP on
create schema auth;
create role authenticated nologin;
create role anon nologin;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated;
grant execute on function auth.uid() to authenticated;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
\i /migrations/202611070001_budget.sql
\i /migrations/202611070002_security.sql
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.budgets(id,owner,currency,limit_minor,state) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','USD',20000,'{"currency":"USD","limit":20000,"version":0,"transactions":[],"plans":[]}'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','USD',20000,'{"currency":"USD","limit":20000,"version":0,"transactions":[],"plans":[]}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$begin if (select count(*) from budgets)<>1 then raise exception 'Cross-user read'; end if; end$$;
do $$begin begin update budgets set limit_minor=999 where owner='00000000-0000-0000-0000-000000000002'; raise exception 'Direct write accepted'; exception when insufficient_privilege then null; end; end$$;
insert into proposals(id,budget_id,expected_version,before_limit,after_limit) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',0,20000,15000);
select approve_proposal('20000000-0000-0000-0000-000000000001');
select approve_proposal('20000000-0000-0000-0000-000000000001');
do $$begin if (select count(*) from audit)<>1 then raise exception 'Duplicate approval'; end if; if (select limit_minor from budgets)<>15000 then raise exception 'Approval not applied'; end if; end$$;
insert into proposals(id,budget_id,expected_version,before_limit,after_limit) values('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',0,20000,10000);
do $$begin begin perform approve_proposal('20000000-0000-0000-0000-000000000002'); raise exception 'Stale accepted'; exception when others then if sqlerrm<>'Stale proposal' then raise; end if; end; end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$begin if (select count(*) from audit)<>0 then raise exception 'Cross-user audit'; end if; begin perform approve_proposal('20000000-0000-0000-0000-000000000001'); raise exception 'Cross-user approval'; exception when others then if sqlerrm<>'Unavailable' then raise; end if; end; end$$;
-- Generic saves cannot bypass the approval path, even through direct RPC calls.
do $$begin begin perform save_budget('{"currency":"USD","limit":999,"version":0,"transactions":[],"plans":[]}',0); raise exception 'Bypass accepted'; exception when others then if sqlerrm<>'Limit change requires approval' then raise; end if; end; end$$;
do $$declare i integer; begin for i in 1..5 loop if not consume_model_quota() then raise exception 'Quota prematurely exhausted'; end if; end loop; if consume_model_quota() then raise exception 'Quota bypass'; end if; end$$;
do $$begin begin update model_quotas set minute_count=0; raise exception 'Quota write accepted'; exception when insufficient_privilege then null; end; end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$begin if not consume_model_quota() then raise exception 'Cross-user quota interference'; end if; end$$;
select 'POLICY CHECKS PASSED' as result;
-- Positive save and stale-save paths remain functional after removing UPDATE grants.
select save_budget('{"currency":"USD","limit":15000,"version":1,"transactions":[],"plans":[]}',1);
do $$begin if (select version from budgets)<>2 then raise exception 'Save not applied'; end if; begin perform save_budget('{"currency":"USD","limit":15000,"version":1,"transactions":[],"plans":[]}',1); raise exception 'Stale save accepted'; exception when others then if sqlerrm<>'Stale budget' then raise; end if; end; end$$;
-- Ownership enforcement applies to inserts as well as reads and RPCs.
do $$begin begin insert into proposals(budget_id,expected_version,before_limit,after_limit) values('10000000-0000-0000-0000-000000000002',0,20000,10000); raise exception 'Foreign proposal accepted'; exception when insufficient_privilege then null; end; end$$;
set role anon;
do $$begin begin perform consume_model_quota(); raise exception 'Anonymous quota call accepted'; exception when insufficient_privilege then null; end; begin perform approve_proposal('20000000-0000-0000-0000-000000000001'); raise exception 'Anonymous approval accepted'; exception when insufficient_privilege then null; end; end$$;
select 'EXTENDED SECURITY CHECKS PASSED' as result;
reset role;
update model_quotas set day_count=100,minute_count=0 where owner='00000000-0000-0000-0000-000000000001';
set role authenticated;
do $$begin if consume_model_quota() then raise exception 'Daily quota bypass'; end if; begin update budgets set limit_minor=1 where owner=auth.uid(); raise exception 'Owner update bypass'; exception when insufficient_privilege then null; end; end$$;
reset role;
update model_quotas set day_start=now()-interval '2 days',minute_start=now()-interval '2 minutes',day_count=100,minute_count=5 where owner='00000000-0000-0000-0000-000000000001';
set role authenticated;
do $$begin if not consume_model_quota() then raise exception 'Quota windows did not reset'; end if; end$$;
select 'DAILY QUOTA AND OWNER-BYPASS CHECKS PASSED' as result;
