-- All monetary fields are exact minor units. No service role credentials in the app.
create table public.budgets (
 id uuid primary key default gen_random_uuid(), owner uuid not null unique references auth.users(id) on delete cascade,
 currency text not null check(currency in ('USD','RUB','KZT')),
 snapshot_date date, snapshot_minor bigint, buffer_minor bigint not null default 0 check(buffer_minor>=0),
 limit_minor bigint not null default 0 check(limit_minor>=0), version integer not null default 0,
 check((snapshot_date is null) = (snapshot_minor is null))
);
create table public.records (
 id uuid primary key default gen_random_uuid(), budget_id uuid not null references public.budgets(id) on delete cascade,
 source_hash text not null, source_row integer not null, source_values jsonb not null, record jsonb not null,
 unique(budget_id,source_hash,source_row)
);
create table public.proposals (
 id uuid primary key default gen_random_uuid(), budget_id uuid not null references public.budgets(id) on delete cascade,
 expected_version integer not null, before_limit bigint not null check(before_limit>=0), after_limit bigint not null check(after_limit>=0),
 approved_at timestamptz
);
create table public.audit (
 id uuid primary key default gen_random_uuid(), budget_id uuid not null references public.budgets(id) on delete cascade,
 proposal_id uuid not null unique references public.proposals(id) on delete cascade, created_at timestamptz not null default now(),
 before_limit bigint not null, after_limit bigint not null
);
create table public.alerts (
 id uuid primary key default gen_random_uuid(), budget_id uuid not null references public.budgets(id) on delete cascade,
 fingerprint text not null, evidence jsonb not null, snoozed_until timestamptz, dismissed boolean not null default false,
 unique(budget_id,fingerprint)
);
alter table public.budgets enable row level security;
alter table public.records enable row level security;
alter table public.proposals enable row level security;
alter table public.audit enable row level security;
alter table public.alerts enable row level security;
create policy own_budget on public.budgets for all to authenticated using(owner=auth.uid()) with check(owner=auth.uid());
create policy own_records on public.records for all to authenticated using(exists(select 1 from public.budgets b where b.id=budget_id and b.owner=auth.uid())) with check(exists(select 1 from public.budgets b where b.id=budget_id and b.owner=auth.uid()));
create policy own_proposals_read on public.proposals for select to authenticated using(exists(select 1 from public.budgets b where b.id=budget_id and b.owner=auth.uid()));
create policy own_proposals_insert on public.proposals for insert to authenticated with check(exists(select 1 from public.budgets b where b.id=budget_id and b.owner=auth.uid()) and approved_at is null);
create policy own_audit on public.audit for select to authenticated using(exists(select 1 from public.budgets b where b.id=budget_id and b.owner=auth.uid()));
create policy own_alerts on public.alerts for all to authenticated using(exists(select 1 from public.budgets b where b.id=budget_id and b.owner=auth.uid())) with check(exists(select 1 from public.budgets b where b.id=budget_id and b.owner=auth.uid()));
-- Security definer is bounded: derive identity from auth.uid, lock proposal and budget,
-- reject stale writes, and write an immutable audit in the same transaction.
create function public.approve_proposal(proposal_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.proposals; b public.budgets;
begin
 select * into p from public.proposals where id=proposal_id for update;
 if not found then raise exception 'Unavailable'; end if;
 select * into b from public.budgets where id=p.budget_id and owner=auth.uid() for update;
 if not found then raise exception 'Unavailable'; end if;
 if p.approved_at is not null then return; end if;
 if b.version<>p.expected_version or b.limit_minor<>p.before_limit then raise exception 'Stale proposal'; end if;
 update public.budgets set limit_minor=p.after_limit,state=jsonb_set(jsonb_set(state,'{limit}',to_jsonb(p.after_limit)),'{version}',to_jsonb(version+1)),version=version+1 where id=b.id;
 update public.proposals set approved_at=now() where id=p.id;
 insert into public.audit(budget_id,proposal_id,before_limit,after_limit) values(b.id,p.id,p.before_limit,p.after_limit);
end $$;
revoke all on function public.approve_proposal(uuid) from public, anon;
grant execute on function public.approve_proposal(uuid) to authenticated;
alter table public.budgets add column state jsonb;
create function public.save_budget(new_state jsonb, expected_version integer) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(new_state)<>'object' or (new_state->>'currency') not in ('USD','RUB','KZT') then raise exception 'Invalid state'; end if;
 update public.budgets set limit_minor=(new_state->>'limit')::bigint,state=jsonb_set(new_state,'{version}',to_jsonb(expected_version+1)),version=expected_version+1
 where owner=auth.uid() and version=expected_version and currency=new_state->>'currency';
 if not found then raise exception 'Stale budget'; end if;
end $$;
revoke all on function public.save_budget(jsonb,integer) from public,anon;
grant execute on function public.save_budget(jsonb,integer) to authenticated;
