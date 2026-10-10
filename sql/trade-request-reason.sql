/* =====================================================================
   A trade request has to say something.

   request_trade() took a trade id and nothing else, so asking for a
   trade was one tap - which is the same weakness as assigning one in
   one tap, moved to the other side of the approval. There was nothing
   on the admin's screen to decide from.

   What it asks for now: how long they have done the work, and a letter
   in their own words - why this trade, what they have done in it, who
   for. One box rather than three fields, because a letter says more
   than a form and how someone writes it is itself worth reading. A
   trade marked requires_proof still needs a document on top.

   The signature changes, so the old function is dropped rather than
   replaced - two overloads would make a named-argument call from the
   app ambiguous. Same for the two functions whose return type grows.
   ===================================================================== */

alter table public.provider_trades
  add column if not exists reason jsonb;


drop function if exists public.request_trade(text, text[]);
drop function if exists public.trade_requests(text);
drop function if exists public.my_trades();


create or replace function public.request_trade(
  p_trade     text,
  p_reason    jsonb   default null,
  p_documents text[]  default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  t        record;
  cur      record;
  v_years  text;
  v_letter text;
  v_reason jsonb;
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

  /* Carry forward what they said last time if this is a resubmission
     and they sent nothing new */
  v_reason := coalesce(p_reason, cur.reason, '{}'::jsonb);

  v_years  := btrim(coalesce(v_reason->>'years', ''));
  v_letter := btrim(coalesce(v_reason->>'letter', ''));

  if v_years = '' then
    raise exception 'Say how long you have done this work';
  end if;

  /* Long enough to be an answer rather than a shrug. Someone who will
     not write three sentences about their own trade is not someone to
     hand it to. */
  if length(v_letter) < 100 then
    raise exception
      'Tell us a bit more - what you have done in this trade and who for. A few sentences.';
  end if;

  if t.requires_proof and coalesce(array_length(p_documents, 1), 0) = 0
     and coalesce(array_length(cur.documents, 1), 0) = 0 then
    raise exception
      'This trade needs proof before it can be granted: %',
      coalesce(t.proof_label, 'a licence or certificate');
  end if;

  insert into provider_trades
    (provider_id, trade_id, status, requested_at, reason, documents)
  values
    (auth.uid(), p_trade, 'pending', now(), v_reason, p_documents)
  on conflict (provider_id, trade_id) do update
    set status       = 'pending',
        requested_at = now(),
        decided_at   = null,
        decided_by   = null,
        reason       = excluded.reason,
        documents    = coalesce(excluded.documents, provider_trades.documents);

  return jsonb_build_object('status','pending','changed',true);
end $fn$;


/** Every trade with this provider's standing against it, plus the
    letter they sent - so a rejected request can be reopened with what
    they wrote still in the box. */
create or replace function public.my_trades()
returns table (
  trade_id       text,
  name           text,
  icon           text,
  category_id    text,
  requires_proof boolean,
  proof_label    text,
  status         text,
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
         pt.requested_at, pt.decided_at, pt.note, pt.reason
  from trades t
  left join provider_trades pt
         on pt.trade_id = t.id and pt.provider_id = auth.uid()
  where t.active
  order by t.sort_order, t.name;
$fn$;


/** The admin queue, now with something to read. */
create or replace function public.trade_requests(p_status text default 'pending')
returns table (
  provider_id    uuid,
  first_name     text,
  last_name      text,
  verification_status text,
  trade_id       text,
  trade_name     text,
  icon           text,
  requires_proof boolean,
  proof_label    text,
  documents      text[],
  status         text,
  requested_at   timestamptz,
  note           text,
  reason         jsonb,
  held_trades    text[]
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select pt.provider_id, p.first_name, p.last_name, p.verification_status,
         pt.trade_id, t.name, t.icon,
         t.requires_proof, t.proof_label,
         pt.documents, pt.status, pt.requested_at, pt.note, pt.reason,
         /* what they already hold, so a plumber asking to be a chef is
            visible as exactly that */
         (select coalesce(array_agg(o.trade_id order by o.trade_id), '{}'::text[])
            from provider_trades o
           where o.provider_id = pt.provider_id
             and o.status = 'approved')
  from provider_trades pt
  join trades t           on t.id = pt.trade_id
  join cleaner_profiles p on p.id = pt.provider_id
  where is_admin()
    and (p_status is null or pt.status = p_status)
  order by pt.requested_at;
$fn$;


grant execute on function public.request_trade(text, jsonb, text[]) to authenticated;
grant execute on function public.my_trades()                        to authenticated;
grant execute on function public.trade_requests(text)               to authenticated;
