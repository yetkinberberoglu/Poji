/* =====================================================================
   A1 - Provider onboarding: the pieces that carry no data risk.

   Three things change here, and nothing existing is removed:

   1. A third answer for the admin. Until now the only moves were
      approve and reject, so "your ID photo is blurry, send another"
      had to be sent as a REJECTION. The provider screen already says
      "We need a few changes" for that state, but the admin screen says
      Rejected in red and that is what the person feels. needs_info
      names the thing we actually meant.

   2. First declaration is free. A provider signing up says what they
      do and we take their word for it - there is nothing to protect
      yet, because the whole account is unapproved and invisible
      (providers_public filters on verification_status = 'approved').
      CHANGING trades on an approved account still needs the letter and
      the admin, which is what request_trade() is for. The rule is:
      first declaration free, later changes reviewed.

   3. Approval becomes one action. Today an admin approves the account
      on one screen and each trade on another, and nobody sets
      available, so an approved provider silently drops out of pool
      matching (matchingProviders filters .eq('available', true)) while
      still being bookable directly.

   Run the whole file in one go. Safe to run twice.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. needs_info joins the list of states.

   The column is constrained by a CHECK, so the constraint has to be
   replaced rather than extended. Dropping and recreating it validates
   every existing row, which is what we want - if some row already
   holds a value outside the list we would rather find out now.
   --------------------------------------------------------------------- */
alter table public.cleaner_profiles
  drop constraint if exists cleaner_profiles_verification_status_check;

alter table public.cleaner_profiles
  add constraint cleaner_profiles_verification_status_check
  check (verification_status = any (array[
    'basic','draft','submitted','under_review',
    'needs_info','approved','rejected'
  ]));


/* ---------------------------------------------------------------------
   2. Let a provider in needs_info resubmit.

   Same body as before with one addition: needs_info is now a state a
   provider may move OUT of, the same way rejected already was. Without
   this the guard would silently revert their resubmission and they
   would press Submit forever.
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
     request_trade() or declares them once with declare_trades(), an
     admin answers with decide_trade(), and sync_provider_categories()
     writes this column. */
  new.categories := old.categories;

  /* Verification state is ours to set, not theirs. The only moves a
     provider may make are the ones the application genuinely needs. */
  if new.verification_status is distinct from old.verification_status then
    if not (
      old.verification_status in ('basic','draft','rejected','needs_info')
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
   3. declare_trades - the first declaration.

   The set passed in is authoritative: trades left out are removed, so
   unticking one in the wizard actually unticks it. This is only
   allowed while the account has never been approved; after that the
   letter-and-review path is the only way in or out.

   A trade marked requires_proof does NOT come through as approved even
   here. Whether Malta wants a licence for a given trade is a legal
   question, and "the account is unapproved anyway" is not a reason to
   hand someone an electrician's badge. Those land as pending and the
   function says which ones, so the wizard can tell the provider we
   will be asking for the certificate.
   --------------------------------------------------------------------- */
create or replace function public.declare_trades(p_trades text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_me      uuid := auth.uid();
  v_status  text;
  v_wanted  text[] := coalesce(p_trades, '{}'::text[]);
  v_approved text[];
  v_pending  text[];
  v_unknown  text[];
begin
  if v_me is null then
    raise exception 'Sign in first';
  end if;

  select verification_status into v_status
    from cleaner_profiles where id = v_me;

  if v_status = 'approved' then
    raise exception
      'Your account is already approved - ask for a new trade from your profile so we can read why';
  end if;

  /* Anything that is not a real trade is reported back rather than
     silently dropped. A typo in the wizard should be visible. */
  select coalesce(array_agg(x), '{}'::text[]) into v_unknown
    from unnest(v_wanted) as x
   where not exists (select 1 from trades t where t.id = x);

  if array_length(v_unknown, 1) > 0 then
    raise exception 'Unknown trade: %', array_to_string(v_unknown, ', ');
  end if;

  /* Gone from the list means gone. Only while unapproved - there is no
     admin decision here to overwrite. */
  delete from provider_trades
   where provider_id = v_me
     and not (trade_id = any (v_wanted));

  insert into provider_trades (provider_id, trade_id, status, requested_at, decided_at)
  select v_me,
         x,
         case when coalesce(t.requires_proof, false) then 'pending' else 'approved' end,
         now(),
         case when coalesce(t.requires_proof, false) then null else now() end
    from unnest(v_wanted) as x
    join trades t on t.id = x
  on conflict (provider_id, trade_id) do update
     set status = case
                    when provider_trades.status = 'approved' then 'approved'
                    when excluded.status = 'approved'        then 'approved'
                    else provider_trades.status
                  end;

  select coalesce(array_agg(trade_id order by trade_id), '{}'::text[])
    into v_approved
    from provider_trades
   where provider_id = v_me and status = 'approved';

  select coalesce(array_agg(trade_id order by trade_id), '{}'::text[])
    into v_pending
    from provider_trades
   where provider_id = v_me and status = 'pending';

  return jsonb_build_object(
    'approved', v_approved,
    'pending',  v_pending
  );
end $fn$;


/* ---------------------------------------------------------------------
   4. approve_provider - one action instead of three screens.

   Sets the account live, approves the trades still waiting, and turns
   on available. That last one is the quiet bug this closes: nothing
   ever set it, so an approved provider stayed out of pool matching
   while appearing in the client's list, and neither side could tell.

   Trades an admin previously REJECTED are left rejected. Approving the
   account is not a reason to undo a decision somebody made on purpose.
   --------------------------------------------------------------------- */
create or replace function public.approve_provider(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_trades int;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  update provider_trades
     set status     = 'approved',
         decided_at = now(),
         decided_by = auth.uid()
   where provider_id = p_id
     and status = 'pending';

  v_trades := coalesce((select count(*) from provider_trades
                         where provider_id = p_id and status = 'approved'), 0);

  update cleaner_profiles
     set verification_status = 'approved',
         available           = true,
         reviewed_at         = now(),
         reviewed_by         = auth.uid(),
         rejection_reason    = null,
         updated_at          = now()
   where id = p_id;

  if not found then
    raise exception 'No such provider';
  end if;

  return jsonb_build_object('status', 'approved', 'trades', v_trades);
end $fn$;


/* ---------------------------------------------------------------------
   5. request_info - "send us a clearer photo".

   The note reuses rejection_reason because that is the column the
   provider screen already reads, and one column holding "what the
   admin told them" is better than two that can disagree. The name is
   now wrong for half its uses; renaming it means touching every reader
   and is not worth doing tonight.
   --------------------------------------------------------------------- */
create or replace function public.request_info(p_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Say what you need from them';
  end if;

  update cleaner_profiles
     set verification_status = 'needs_info',
         rejection_reason    = btrim(p_note),
         reviewed_at         = now(),
         reviewed_by         = auth.uid(),
         updated_at          = now()
   where id = p_id;

  if not found then
    raise exception 'No such provider';
  end if;

  return jsonb_build_object('status', 'needs_info');
end $fn$;


/* ---------------------------------------------------------------------
   6. Who may call what.
   --------------------------------------------------------------------- */
grant execute on function public.declare_trades(text[])        to authenticated;
grant execute on function public.approve_provider(uuid)        to authenticated;
grant execute on function public.request_info(uuid, text)      to authenticated;

notify pgrst, 'reload schema';


/* ---------------------------------------------------------------------
   Check it landed. Expect three rows.
   --------------------------------------------------------------------- */
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('declare_trades','approve_provider','request_info')
 order by 1;
