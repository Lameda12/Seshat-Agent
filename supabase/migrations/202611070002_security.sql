-- Defense in depth: RLS alone does not protect approval-controlled columns from owners.
revoke update on public.budgets from authenticated, anon;
revoke all on public.audit from authenticated, anon;
grant select on public.audit to authenticated;
revoke all on public.proposals from authenticated, anon;
grant select,insert on public.proposals to authenticated;

alter table public.budgets add constraint state_envelope check (
 state is null or (
  jsonb_typeof(state)='object' and octet_length(state::text)<=2000000
  and state ?& array['currency','limit','version','transactions','plans']
  and state->>'currency'=currency
  and (state->>'limit')::bigint=limit_minor
  and (state->>'version')::integer=version
  and jsonb_typeof(state->'transactions')='array' and jsonb_array_length(state->'transactions')<=10000
  and jsonb_typeof(state->'plans')='array' and jsonb_array_length(state->'plans')<=1000
  and limit_minor between 0 and 100000000000
  and version>=0
 ) is true
);
-- New accounts start with no approved limit. Subsequent changes use approve_proposal.
drop policy own_budget on public.budgets;
create policy own_budget_read on public.budgets for select to authenticated using(owner=auth.uid());
create policy own_budget_delete on public.budgets for delete to authenticated using(owner=auth.uid());
create policy own_budget_insert on public.budgets for insert to authenticated with check(owner=auth.uid() and limit_minor=0 and version=0 and state is not null);

create or replace function public.save_budget(new_state jsonb,expected_version integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.budgets;
begin
 select * into b from public.budgets where owner=auth.uid() for update;
 if not found then raise exception 'Unavailable'; end if;
 if b.version<>expected_version then raise exception 'Stale budget'; end if;
 if new_state is null or jsonb_typeof(new_state)<>'object'
 or new_state->>'currency' is distinct from b.currency
 or (new_state->>'limit')::bigint is distinct from b.limit_minor then raise exception 'Limit change requires approval'; end if;
 update public.budgets set state=jsonb_set(new_state,'{version}',to_jsonb(b.version+1)),version=b.version+1 where id=b.id;
end $$;
revoke all on function public.save_budget(jsonb,integer) from public,anon;
grant execute on function public.save_budget(jsonb,integer) to authenticated;

-- A single row per account bounds paid-model usage across processes and restarts.
create table public.model_quotas (
 owner uuid primary key references auth.users(id) on delete cascade,
 minute_start timestamptz not null default now(), minute_count integer not null default 0,
 day_start timestamptz not null default now(),day_count integer not null default 0
);
alter table public.model_quotas enable row level security;
revoke all on public.model_quotas from public,anon,authenticated;
create function public.consume_model_quota() returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.model_quotas; current_user_id uuid:=auth.uid(); current_time_value timestamptz:=clock_timestamp();
begin
 if current_user_id is null then raise exception 'Authentication required'; end if;
 insert into public.model_quotas(owner) values(current_user_id) on conflict do nothing;
 select * into q from public.model_quotas where owner=current_user_id for update;
 if current_time_value>=q.minute_start+interval '1 minute' then q.minute_start:=current_time_value; q.minute_count:=0; end if;
 if current_time_value>=q.day_start+interval '1 day' then q.day_start:=current_time_value; q.day_count:=0; end if;
 if q.minute_count>=5 or q.day_count>=100 then return false; end if;
 update public.model_quotas set minute_start=q.minute_start,minute_count=q.minute_count+1,day_start=q.day_start,day_count=q.day_count+1 where owner=current_user_id;
 return true;
end $$;
revoke all on function public.consume_model_quota() from public,anon;
grant execute on function public.consume_model_quota() to authenticated;
revoke create on schema public from public,anon,authenticated;
revoke all on public.budgets,public.records,public.proposals,public.audit,public.alerts from anon;
grant select,insert,delete on public.budgets to authenticated;
alter table public.proposals add constraint proposal_amount_bounds check(before_limit<=100000000000 and after_limit<=100000000000 and expected_version>=0);
