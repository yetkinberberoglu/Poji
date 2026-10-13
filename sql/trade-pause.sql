-- =====================================================================
-- An on/off switch a provider owns, separate from the one we own.
--
-- withdraw_trade already let a provider drop a trade, but it DELETES the
-- row. Someone who stops offering cleaning for a season loses the
-- approval itself, and coming back means writing the letter again and
-- waiting on a decision. That is the wrong weight for "not right now".
--
-- suspend_trade is the other end: admin only, and withdraw_trade refuses
-- to touch a suspended trade so nobody escapes a decision by dropping
-- it. Correct, but "suspended" is the wrong word for a provider closing
-- their own shutter.
--
-- So: paused is theirs, suspended is ours. Both hide the trade from
-- clients. Only one of them the provider can undo, and neither loses
-- the approval - flipping paused back on is instant, with no letter and
-- no queue.
--
-- Run the whole file. Safe to run twice.
-- =====================================================================


-- 1. The flag.
alter table public.provider_trades
  add column if not exists paused    boolean not null default false,
  add column if not exists paused_at timestamptz;

comment on column public.provider_trades.paused is
  'The provider''s own switch. Hides the trade from clients without losing the approval. Distinct from status=suspended, which is ours and which they cannot undo.';


-- 2. categories follows it.
-- Only approved AND not paused reaches the column seven screens read.
create or replace function public.sync_provider_categories(p_provider uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  cats text[];
begin
  select coalesce(array_agg(pt.trade_id order by t.sort_order, pt.trade_id), '{}'::text[])
    into cats
  from provider_trades pt
  join trades t on t.id = pt.trade_id
  where pt.provider_id = p_provider
    and pt.status = 'approved'
    and not pt.paused;

  perform poji_trust();

  update cleaner_profiles
     set categories = cats
   where id = p_provider
     and categories is distinct from cats;
end $fn$;


-- 3. The switch itself.
-- Called with no provider id it acts on the caller's own trade. Passing
-- someone else's id is an admin action, for the provider who rings up
-- and asks us to close it for them.
create or replace function public.set_trade_paused(
  p_trade    text,
  p_paused   boolean,
  p_provider uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_target uuid := coalesce(p_provider, auth.uid());
  cur record;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if v_target is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Admins only';
  end if;

  select * into cur from provider_trades
   where provider_id = v_target and trade_id = p_trade;

  if not found then
    raise exception 'You do not hold that trade';
  end if;

  -- A provider may not pause or unpause their way out of a suspension.
  -- An admin may, because an admin is the one who lifts it.
  if cur.status = 'suspended' and not public.is_admin() then
    raise exception 'That trade is suspended on your account. Contact Poji.';
  end if;

  update provider_trades
     set paused    = p_paused,
         paused_at = case when p_paused then now() else null end
   where provider_id = v_target and trade_id = p_trade;

  return jsonb_build_object('trade', p_trade, 'paused', p_paused);
end $fn$;


-- 4. my_trades has to carry the flag, or the profile screen cannot draw
-- the switch. The return type changes, so it is dropped and rebuilt.
drop function if exists public.my_trades();

create or replace function public.my_trades()
returns table (
  trade_id       text,
  name           text,
  icon           text,
  category_id    text,
  requires_proof boolean,
  proof_label    text,
  status         text,
  paused         boolean,
  paused_at      timestamptz,
  requested_at   timestamptz,
  decided_at     timestamptz,
  note           text,
  reason         jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select t.id, t.name, t.icon, t.category_id,
         t.requires_proof, t.proof_label,
         coalesce(pt.status, 'none'),
         coalesce(pt.paused, false),
         pt.paused_at,
         pt.requested_at, pt.decided_at, pt.note, pt.reason
  from trades t
  left join provider_trades pt
         on pt.trade_id = t.id and pt.provider_id = auth.uid()
  where t.active
  order by t.sort_order, t.name;
$fn$;


-- 5. Grants.
grant execute on function public.set_trade_paused(text, boolean, uuid) to authenticated;
grant execute on function public.my_trades()                           to authenticated;

notify pgrst, 'reload schema';


-- 6. Check. Expect the column, the function, and nobody paused yet.
select 'column' as ne, count(*)::text as kac
  from information_schema.columns
 where table_schema='public' and table_name='provider_trades' and column_name='paused'
union all
select 'function', count(*)::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='set_trade_paused'
union all
select 'paused simdi', count(*)::text
  from provider_trades where paused;
