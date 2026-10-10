/* =====================================================================
   Money on a new booking is computed in Postgres, not in the app.

   guard_booking() already freezes these columns on UPDATE, but INSERT
   was wide open: whatever the client sent became the frozen truth.
   Six client files compute it with a hardcoded 18% VAT and a hardcoded
   20% commission - both wrong since we moved to VAT-inclusive pricing
   and per-service commission. A roadside job booked on 8 October shows
   it: 68.61 total, 45.20 recorded as the provider's payment, where
   settlement says 53.10. Nearly eight euro short on a sixty-six euro
   job, and frozen there for good.

   After this, whatever the client sends is overwritten on insert. The
   app can keep sending its numbers until we clean it up; they simply
   do not survive the trigger.

   Run the whole file in one go. Everything is created before the
   trigger that uses it.
   ===================================================================== */


/* ---------------------------------------------------------------------
   What a service costs before the platform's own arithmetic: the
   provider's own price if they set one, the service's default
   otherwise, plus whatever the client's answers add or take off.

   The roadside flow books a job without pricing it client-side, so
   labour_total arrives null and this is where the figure comes from.

   price_booking() carries the same logic inline. It is left alone for
   now because the app calls it; this is the copy the trigger uses, and
   the two should be merged once the client stops pricing anything.
   --------------------------------------------------------------------- */
create or replace function public.poji_service_price(
  p_service  text,
  p_provider uuid,
  p_answers  jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  st     record;
  ps     record;
  labour numeric;
  parts  numeric;
  qrec   jsonb;
  opt    jsonb;
  chosen text;
begin
  select * into st from service_types where id = p_service and active;
  if not found then
    raise exception 'Unknown service %', p_service;
  end if;

  select * into ps from provider_services
   where provider_id      = p_provider
     and service_type_id  = p_service
     and active;

  /* fixed_price is the older column, still the only figure set on a
     few services. roadside.tsx reads labour_price ?? fixed_price, so
     this reads the same way round, or the two would disagree. */
  labour := coalesce(ps.labour_price, st.labour_price, st.fixed_price, 0);
  parts  := coalesce(ps.parts_price,  st.parts_price,  0);

  for qrec in
    select * from jsonb_array_elements(coalesce(st.questions, '[]'::jsonb))
  loop
    if qrec ? 'affects' then
      chosen := p_answers ->> (qrec->>'id');
      if chosen is not null then
        for opt in
          select * from jsonb_array_elements(coalesce(qrec->'options', '[]'::jsonb))
        loop
          if jsonb_typeof(opt) = 'object' and opt->>'label' = chosen then
            if qrec->>'affects' = 'parts'
              then parts  := parts  + coalesce((opt->>'delta')::numeric, 0);
              else labour := labour + coalesce((opt->>'delta')::numeric, 0);
            end if;
          end if;
        end loop;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'labour',  round(labour, 2),
    'parts',   round(parts, 2),
    'callout', round(coalesce(st.callout_fee, 0), 2)
  );
end $fn$;


/* ---------------------------------------------------------------------
   The trigger itself.
   --------------------------------------------------------------------- */
create or replace function public.price_new_booking()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  r      record;
  st     record;
  s      jsonb;
  sp     jsonb;
  comm   numeric;
  disc   numeric;
  mins   integer;
  ex     numeric;
  total  numeric;
  prov   numeric;
  plat   numeric;
  model  text;
begin
  select * into r  from poji_rates();
  select * into st from service_types where id = new.service_type;

  /* The effective rate, resolved here rather than left to default
     inside the settlement function. commission_rate exists to FREEZE
     the rate onto the booking, so that changing the platform rate next
     month cannot reprice work already agreed. Writing null would undo
     that: finish_job would fall back to whatever the rate is by then. */
  comm  := coalesce(nullif(coalesce(st.labour_commission, 0), 0),
                    r.labour_commission);
  disc  := greatest(coalesce(new.discount, 0), 0);
  model := coalesce(new.pricing_model, 'hourly');

  new.vat_rate        := r.vat;
  new.commission_rate := comm;

  /* A quote booking has no agreed price yet. accept_quote() writes the
     money once the client accepts a quote, so everything stays at zero
     here rather than carrying a guess the provider could be held to. */
  if model = 'quote' then
    new.price_ex_vat        := 0;
    new.vat_amount          := 0;
    new.stripe_fee          := 0;
    new.total_price         := 0;
    new.estimated_total     := 0;
    new.provider_payment    := 0;
    new.platform_commission := 0;
    return new;
  end if;

  if model in ('fixed', 'unit') then

    /* Roadside and anything else that books without pricing: take the
       figure from the service, never from the client. Callout is folded
       into labour_total and the settlement is then called with a zero
       callout, so finish_job - which does exactly that - reproduces
       this number instead of adding the callout a second time. */
    if coalesce(new.labour_total, 0) <= 0 then
      sp := poji_service_price(new.service_type, new.provider_id,
                               coalesce(new.answers, '{}'::jsonb));

      new.labour_total := (sp->>'labour')::numeric + (sp->>'callout')::numeric;

      if coalesce(new.parts_total, 0) = 0 then
        new.parts_total := (sp->>'parts')::numeric;
      end if;

      if coalesce(new.labour_total, 0) <= 0 then
        raise exception
          'Service % has no price set, so this booking cannot be priced',
          new.service_type;
      end if;
    end if;

    s  := poji_settle_fixed(new.labour_total,
                            coalesce(new.parts_total, 0),
                            0,
                            coalesce(new.is_urgent, false),
                            0, comm);
    /* in the fixed settlement ex_vat already carries parts */
    ex := (s->>'ex_vat')::numeric;

  else
    mins := coalesce(new.estimated_minutes, 60);
    s    := poji_settle_hourly(coalesce(new.hourly_rate, 15),
                               coalesce(new.service_multiplier, 1),
                               new.supplies_by = 'cleaner',
                               coalesce(new.num_workers, 1),
                               mins,
                               coalesce(new.parts_total, 0));
    /* in the hourly settlement ex_vat is labour only */
    ex := (s->>'ex_vat')::numeric + (s->>'parts')::numeric;
  end if;

  prov  := (s->>'provider_gets')::numeric;
  plat  := (s->>'labour_commission')::numeric
         + (s->>'parts_commission')::numeric;
  total := (s->>'total')::numeric;

  /* A promo is Poji's campaign, so Poji pays for it: the client pays
     less, the provider's figure does not move, and the whole discount
     comes out of commission. */
  if disc > 0 then
    total := round(total - disc, 2);
    plat  := round(plat  - disc, 2);
  end if;

  new.price_ex_vat        := ex;
  new.vat_amount          := (s->>'vat')::numeric;
  new.stripe_fee          := (s->>'stripe_fee')::numeric;
  new.total_price         := total;
  new.estimated_total     := total;
  new.provider_payment    := prov;
  new.platform_commission := plat;

  return new;
end $fn$;


drop trigger if exists trg_price_new_booking on public.bookings;

create trigger trg_price_new_booking
  before insert on public.bookings
  for each row execute function public.price_new_booking();
