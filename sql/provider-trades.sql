/* =====================================================================
   A trade is granted, not chosen.

   Until now cleaner_profiles.categories was a plain array the provider
   wrote to from their own profile screen. A tiler could become a chef
   in one tap. Three things were wrong with that: trades that need a
   licence or a food-hygiene certificate had no gate; the rating earned
   as a tiler followed them into the new trade; and a provider suspended
   in one trade reappeared in another.

   Seven screens read categories - the job list, the client-facing
   provider list, pool matching, booking. Rather than change all seven,
   categories becomes a DERIVED column: provider_trades holds the real
   record, and a trigger rewrites categories from the approved rows
   only. Every existing reader then sees approved trades and nothing
   else, without being touched.

   What stays self-service: prices, radius, availability, notice hours.
   Those are the provider's own business and always were.

   Run the whole file in one go. Everything is created before the
   grants and the trigger that use it.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. Which trades need proof before they are granted.

   Left to the admin screen rather than hardcoded here: whether Malta
   requires a licence for a given trade is a legal question, not one to
   guess at in a migration.
   --------------------------------------------------------------------- */
alter table public.trades
  add column if not exists requires_proof boolean not null default false,
  add column if not exists proof_label    text;


/* ---------------------------------------------------------------------
   2. The record itself.
   --------------------------------------------------------------------- */
create table if not exists public.provider_trades (
  provider_id  uuid not null references public.cleaner_profiles(id) on delete cascade,
  trade_id     text not null references public.trades(id),
  status       text not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid,
  note         text,
  documents    text[],
  primary key (provider_id, trade_id),
  constraint provider_trades_status_chk
    check (status in ('pending','approved','rejected','suspended'))
);

create index if not exists provider_trades_pending_idx
  on public.provider_trades (status, requested_at)
  where status = 'pending';

create index if not exists provider_trades_trade_idx
  on public.provider_trades (trade_id, status);


/* ---------------------------------------------------------------------
   3. Move what is already there across, as approved.

   Everyone currently working keeps working. A category with no matching
   row in trades is skipped rather than failing the migration - run the
   check query in the comment at the foot of this file to see whether
   there are any.
   --------------------------------------------------------------------- */
insert into public.provider_trades
  (provider_id, trade_id, status, requested_at, decided_at, note)
select p.id, c.cat, 'approved', now(), now(),
       'Carried over when per-trade approval was introduced'
from public.cleaner_profiles p
cross join lateral unnest(coalesce(p.categories, '{}'::text[])) as c(cat)
where exists (select 1 from public.trades t where t.id = c.cat)
on conflict (provider_id, trade_id) do nothing;


/* ---------------------------------------------------------------------
   4. Keep categories in step with the approved rows.
   --------------------------------------------------------------------- */
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
    and pt.status = 'approved';

  perform poji_trust();

  update cleaner_profiles
     set categories = cats
   where id = p_provider
     and categories is distinct from cats;
end $fn$;


create or replace function public.provider_trades_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if tg_op = 'DELETE' then
    perform sync_provider_categories(old.provider_id);
    return old;
  end if;

  perform sync_provider_categories(new.provider_id);

  /* a provider moved between accounts should not leave the old one
     carrying the trade */
  if tg_op = 'UPDATE' and new.provider_id is distinct from old.provider_id then
    perform sync_provider_categories(old.provider_id);
  end if;

  return new;
end $fn$;


drop trigger if exists trg_provider_trades_sync on public.provider_trades;

create trigger trg_provider_trades_sync
  after insert or update or delete on public.provider_trades
  for each row execute function public.provider_trades_sync();


/* ---------------------------------------------------------------------
   5. Close the door the profile screen used to walk through.

   This replaces guard_cleaner_profile with the same body plus two
   additions: a bypass for our own functions, and the categories
   freeze. Nothing that was guarded before is unguarded now.
   --------------------------------------------------------------------- */
create or replace function public.guard_cleaner_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  /* set inside sync_provider_categories, and nowhere a client can reach:
     set_config is transaction-local, so calling poji_trust() over RPC
     does not carry into a later statement */
  if coalesce(current_setting('poji.trusted', true), '') = 'on' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  /* Trades are granted, not chosen. A provider asks with
     request_trade(), an admin answers with decide_trade(), and
     sync_provider_categories() writes this column. */
  new.categories := old.categories;

  /* Verification state is ours to set, not theirs. The only moves a
     provider may make are the ones the application genuinely needs. */
  if new.verification_status is distinct from old.verification_status then
    if not (
      old.verification_status in ('basic','draft','rejected')
      and new.verification_status in ('basic','draft','submitted')
    ) then
      new.verification_status := old.verification_status;
    end if;
  end if;

  /* Penalties, suspensions and review notes are never self-served */
  new.reviewed_at        := old.reviewed_at;
  new.reviewed_by        := old.reviewed_by;
  new.rejection_reason   := old.rejection_reason;
  new.suspended_until    := old.suspended_until;
  new.outstanding_fines  := old.outstanding_fines;

  return new;
end $fn$;


/* ---------------------------------------------------------------------
   6. What the provider can do.
   --------------------------------------------------------------------- */
create or replace function public.request_trade(
  p_trade     text,
  p_documents text[] default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  t   record;
  cur record;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into t from trades where id = p_trade and active;
  if not found then
    raise exception 'No such trade: %', p_trade;
  end if;

  select * into cur from provider_trades
   where provider_id = auth.uid() and trade_id = p_trade;

  /* A suspension is not something to re-apply your way out of */
  if cur.status = 'suspended' then
    raise exception 'That trade is suspended on your account. Contact Poji.';
  end if;

  if cur.status = 'approved' then
    return jsonb_build_object('status','approved','changed',false);
  end if;

  if t.requires_proof and coalesce(array_length(p_documents, 1), 0) = 0
     and coalesce(array_length(cur.documents, 1), 0) = 0 then
    raise exception
      'This trade needs proof before it can be granted: %',
      coalesce(t.proof_label, 'a licence or certificate');
  end if;

  insert into provider_trades
    (provider_id, trade_id, status, requested_at, documents)
  values
    (auth.uid(), p_trade, 'pending', now(), p_documents)
  on conflict (provider_id, trade_id) do update
    set status       = 'pending',
        requested_at = now(),
        decided_at   = null,
        decided_by   = null,
        documents    = coalesce(excluded.documents, provider_trades.documents);

  return jsonb_build_object('status','pending','changed',true);
end $fn$;


create or replace function public.withdraw_trade(p_trade text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  cur record;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into cur from provider_trades
   where provider_id = auth.uid() and trade_id = p_trade;

  if not found then
    return jsonb_build_object('removed', false);
  end if;

  if cur.status = 'suspended' then
    raise exception 'That trade is suspended on your account. Contact Poji.';
  end if;

  /* Dropping a trade you were approved for is allowed - people stop
     offering things. It goes away rather than being marked rejected,
     so asking again later starts clean. */
  delete from provider_trades
   where provider_id = auth.uid() and trade_id = p_trade;

  return jsonb_build_object('removed', true);
end $fn$;


/** Every trade with this provider's standing against it, for the
    profile screen: one query instead of a join in the client. */
create or replace function public.my_trades()
returns table (
  trade_id      text,
  name          text,
  icon          text,
  category_id   text,
  requires_proof boolean,
  proof_label   text,
  status        text,
  requested_at  timestamptz,
  decided_at    timestamptz,
  note          text
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select t.id, t.name, t.icon, t.category_id,
         t.requires_proof, t.proof_label,
         coalesce(pt.status, 'none'),
         pt.requested_at, pt.decided_at, pt.note
  from trades t
  left join provider_trades pt
         on pt.trade_id = t.id and pt.provider_id = auth.uid()
  where t.active
  order by t.sort_order, t.name;
$fn$;


/* ---------------------------------------------------------------------
   7. What the admin can do.
   --------------------------------------------------------------------- */
create or replace function public.decide_trade(
  p_provider uuid,
  p_trade    text,
  p_approve  boolean,
  p_note     text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not is_admin() then
    raise exception 'Admins only';
  end if;

  update provider_trades
     set status     = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(),
         decided_by = auth.uid(),
         note       = p_note
   where provider_id = p_provider and trade_id = p_trade;

  if not found then
    raise exception 'No such request';
  end if;

  return jsonb_build_object(
    'status', case when p_approve then 'approved' else 'rejected' end);
end $fn$;


/** Suspend or restore one trade without touching the whole account. */
create or replace function public.suspend_trade(
  p_provider uuid,
  p_trade    text,
  p_suspend  boolean,
  p_note     text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not is_admin() then
    raise exception 'Admins only';
  end if;

  update provider_trades
     set status     = case when p_suspend then 'suspended' else 'approved' end,
         decided_at = now(),
         decided_by = auth.uid(),
         note       = coalesce(p_note, note)
   where provider_id = p_provider and trade_id = p_trade;

  if not found then
    raise exception 'That provider does not hold that trade';
  end if;

  return jsonb_build_object(
    'status', case when p_suspend then 'suspended' else 'approved' end);
end $fn$;


/** The admin queue: who is waiting on what. */
create or replace function public.trade_requests(p_status text default 'pending')
returns table (
  provider_id  uuid,
  first_name   text,
  last_name    text,
  verification_status text,
  trade_id     text,
  trade_name   text,
  icon         text,
  requires_proof boolean,
  proof_label  text,
  documents    text[],
  status       text,
  requested_at timestamptz,
  note         text
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select pt.provider_id, p.first_name, p.last_name, p.verification_status,
         pt.trade_id, t.name, t.icon,
         t.requires_proof, t.proof_label,
         pt.documents, pt.status, pt.requested_at, pt.note
  from provider_trades pt
  join trades t           on t.id = pt.trade_id
  join cleaner_profiles p on p.id = pt.provider_id
  where is_admin()
    and (p_status is null or pt.status = p_status)
  order by pt.requested_at;
$fn$;


/* ---------------------------------------------------------------------
   8. Row security. The table is read through the functions above, but
      a provider may also read their own rows directly.
   --------------------------------------------------------------------- */
alter table public.provider_trades enable row level security;

drop policy if exists provider_trades_own_read on public.provider_trades;
create policy provider_trades_own_read on public.provider_trades
  for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());

/* No insert, update or delete policy on purpose: every write goes
   through request_trade, withdraw_trade, decide_trade or
   suspend_trade, which are the only places the rules live. */


/* ---------------------------------------------------------------------
   9. Grants, last, once everything they point at exists.
   --------------------------------------------------------------------- */
grant select on public.provider_trades to authenticated;

grant execute on function public.request_trade(text, text[])          to authenticated;
grant execute on function public.withdraw_trade(text)                 to authenticated;
grant execute on function public.my_trades()                          to authenticated;
grant execute on function public.decide_trade(uuid, text, boolean, text)  to authenticated;
grant execute on function public.suspend_trade(uuid, text, boolean, text) to authenticated;
grant execute on function public.trade_requests(text)                 to authenticated;


/* ---------------------------------------------------------------------
   Afterwards, worth running:

   categories that could not be carried over, because no such trade
   exists - each one is a trade the provider will lose on the next sync

     select p.id, c.cat
     from cleaner_profiles p
     cross join lateral unnest(coalesce(p.categories,'{}')) as c(cat)
     where not exists (select 1 from trades t where t.id = c.cat);

   what everyone now holds

     select provider_id, status, array_agg(trade_id order by trade_id)
     from provider_trades group by 1, 2 order by 1, 2;
   --------------------------------------------------------------------- */
