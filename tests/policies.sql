\set ON_ERROR_STOP on
create schema auth;
create role authenticated nologin;
create role anon nologin;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated;
grant execute on function auth.uid() to authenticated;
\i /migration.sql
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.budgets(id,owner,currency,limit_minor,state) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','USD',20000,'{"limit":20000,"version":0}'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','USD',20000,'{"limit":20000,"version":0}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$begin if (select count(*) from budgets)<>1 then raise exception 'Cross-user read'; end if; end$$;
do $$begin update budgets set limit_minor=999 where owner='00000000-0000-0000-0000-000000000002'; if found then raise exception 'Cross-user write'; end if; end$$;
insert into proposals(id,budget_id,expected_version,before_limit,after_limit) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',0,20000,15000);
select approve_proposal('20000000-0000-0000-0000-000000000001');
select approve_proposal('20000000-0000-0000-0000-000000000001');
do $$begin if (select count(*) from audit)<>1 then raise exception 'Duplicate approval'; end if; if (select limit_minor from budgets)<>15000 then raise exception 'Approval not applied'; end if; end$$;
insert into proposals(id,budget_id,expected_version,before_limit,after_limit) values('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',0,20000,10000);
do $$begin begin perform approve_proposal('20000000-0000-0000-0000-000000000002'); raise exception 'Stale accepted'; exception when others then if sqlerrm<>'Stale proposal' then raise; end if; end; end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$begin if (select count(*) from audit)<>0 then raise exception 'Cross-user audit'; end if; begin perform approve_proposal('20000000-0000-0000-0000-000000000001'); raise exception 'Cross-user approval'; exception when others then if sqlerrm<>'Unavailable' then raise; end if; end; end$$;
select 'POLICY CHECKS PASSED' as result;
