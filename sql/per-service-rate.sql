/* =====================================================================
   An hour of a chef is not an hour of a cleaner.

   hourly_rate lived on cleaner_profiles, one figure for the account. A
   provider approved for cleaning, DJ sets and private cooking had to
   charge the same for all three. Fixed and unit work was already priced
   per service in provider_services; only the hourly side was stuck.

   Two things this does NOT do:

   - It does not invent a rate. The old code fell back to 15 EUR when it
     found nothing, which means a provider could be paid a number they
     never agreed to. Now the chain is: their rate for this service,
     then the rate on their profile, then an error. A service with no
     rate anywhere is not bookable and the provider is told so.

   - It does not apply the service multiplier on top of a rate the
     provider set themselves. The multiplier exists to lift a general
     rate for harder work; someone who priced deep cleaning at 25 has
     already accounted for that, and multiplying by 1.3 again would
     charge for it twice.

   The insert trigger is reissued as well. It was reading hourly_rate
   from whatever the client sent, which was fine while there was one
   rate per account and is not fine now.

   Run the whole file in one go.
   ===================================================================== */

alter table public.provider_services
  add column if not exists hourly_rate numeric,
  add column if not exists min_hours   numeric;


/* ---------------------------------------------------------------------
   The rate for one provider doing one service, and whether it is their
   own figure - which decides whether the multiplier still applies.
   --------------------------------------------------------------------- */
create or replace function public.poji_hourly_rate(
  p_provider uuid,
  p_service  text
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_own   numeric;
  v_prof  numeric;
  v_mult  numeric;
  v_min   numeric;
begin
  select ps.hourly_rate, ps.min_hours
    into v_own, v_min
  from provider_services ps
  where ps.provider_id     = p_provider
    and ps.service_type_id = p_service
    and ps.active;

  select cp.hourly_rate into v_prof
  from cleaner_profiles cp where cp.id = p_provider;

  if v_min is null then
    select cp.min_hours into v_min
    from cleaner_profiles cp where cp.id = p_provider;
  end if;

  /* Their own rate for this service turns the multiplier off, because
     it is already priced in. */
  if coalesce(v_own, 0) > 0 then
    v_mult := 1;
  else
    select coalesce(t.multiplier, 1) into v_mult
    from service_types t where t.id = p_service;
  end if;

  return jsonb_build_object(
    'rate',      coalesce(nullif(v_own, 0), v_prof),
    'own',       coalesce(v_own, 0) > 0,
    'multiplier', coalesce(v_mult, 1),
    'min_hours', v_min
  );
end $fn$;


/* ---------------------------------------------------------------------
   price_booking, with the hourly branch reading the service rate.
   --------------------------------------------------------------------- */
create or replace function public.price_booking(
  p_service  text,
  p_provider uuid,
  p_minutes  integer default null,
  p_cleaners integer default 1,
  p_supplies boolean default false,
  p_answers  jsonb   default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  t record; ps record;
  labour numeric; parts numeric; mins integer;
  q jsonb; adj_labour numeric := 0; adj_parts numeric := 0;
  qrec jsonb; opt jsonb; chosen text;
  hr jsonb;
begin
  select * into t from service_types where id = p_service and active;
  if not found then raise exception 'Unknown service'; end if;

  select * into ps from provider_services
   where provider_id = p_provider and service_type_id = p_service and active;

  labour := coalesce(ps.labour_price, t.labour_price, 0);
  parts  := coalesce(ps.parts_price,  t.parts_price,  0);
  mins   := coalesce(p_minutes, ps.typical_minutes, t.typical_minutes, 60);

  for qrec in select * from jsonb_array_elements(coalesce(t.questions,'[]'::jsonb))
  loop
    if qrec ? 'affects' then
      chosen := p_answers ->> (qrec->>'id');
      if chosen is not null then
        for opt in select * from jsonb_array_elements(coalesce(qrec->'options','[]'::jsonb))
        loop
          if jsonb_typeof(opt) = 'object' and opt->>'label' = chosen then
            if qrec->>'affects' = 'parts'
              then adj_parts  := adj_parts  + coalesce((opt->>'delta')::numeric,0);
              else adj_labour := adj_labour + coalesce((opt->>'delta')::numeric,0);
            end if;
          end if;
        end loop;
      end if;
    end if;
  end loop;

  if coalesce(t.pricing_model,'hourly') = 'quote' then
    return jsonb_build_object('model','quote','total',0,
                              'price_min', coalesce(ps.price_min, t.price_min),
                              'price_max', coalesce(ps.price_max, t.price_max));
  end if;

  if t.pricing_model in ('fixed','unit') then
    q := poji_settle_fixed(labour + adj_labour, parts + adj_parts,
                           coalesce(t.callout_fee,0), false,
                           0, nullif(t.labour_commission,0));
    return q || jsonb_build_object('model', t.pricing_model, 'minutes', mins);
  end if;

  hr := poji_hourly_rate(p_provider, p_service);

  if coalesce((hr->>'rate')::numeric, 0) <= 0 then
    raise exception
      'No hourly rate set for this service. The provider needs to set one before it can be booked.';
  end if;

  q := poji_settle_hourly((hr->>'rate')::numeric,
                          (hr->>'multiplier')::numeric,
                          p_supplies, p_cleaners, mins, 0);

  return q || jsonb_build_object(
    'model','hourly', 'minutes', mins,
    'rate', (hr->>'rate')::numeric,
    'own_rate', (hr->>'own')::boolean,
    'min_hours', hr->'min_hours');
end $fn$;


/* ---------------------------------------------------------------------
   The insert trigger, reissued. Only the hourly branch changes: the
   rate and the multiplier are resolved here rather than taken from the
   client, and a booking that cannot be priced is refused instead of
   being recorded at a made-up rate.
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
  hr     jsonb;
  who    uuid;
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

    /* Whose rate applies. On a pooled job nobody has taken it yet, so
       there is no rate to resolve and the preferred provider's figure
       is the best there is. */
    who := coalesce(new.provider_id, new.preferred_provider_id);

    if who is not null then
      hr := poji_hourly_rate(who, new.service_type);

      if coalesce((hr->>'rate')::numeric, 0) <= 0 then
        raise exception
          'That provider has not set an hourly rate for %, so this cannot be booked yet',
          new.service_type;
      end if;

      new.hourly_rate        := (hr->>'rate')::numeric;
      new.service_multiplier := (hr->>'multiplier')::numeric;
    end if;

    if coalesce(new.hourly_rate, 0) <= 0 then
      raise exception 'No hourly rate on this booking, so it cannot be priced';
    end if;

    s := poji_settle_hourly(new.hourly_rate,
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


grant execute on function public.poji_hourly_rate(uuid, text) to authenticated;


/* ---------------------------------------------------------------------
   Afterwards, worth running: which hourly services have no rate at all
   and are therefore not bookable, so the provider can be nudged.

     select ps.provider_id, ps.service_type_id,
            ps.hourly_rate as servis_ucreti,
            cp.hourly_rate as profil_ucreti
     from provider_services ps
     join service_types t  on t.id = ps.service_type_id
     join cleaner_profiles cp on cp.id = ps.provider_id
     where ps.active and coalesce(t.pricing_model,'hourly') = 'hourly'
       and coalesce(ps.hourly_rate, cp.hourly_rate, 0) <= 0;
   --------------------------------------------------------------------- */
