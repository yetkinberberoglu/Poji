-- =====================================================================
-- Moving gets its own shelf.
--
-- "Moving help" sat under Outdoor & property, whose own description
-- reads "Gardens, pools, solar, moving". Nobody about to move a flat
-- browses garden services. It also carried one service for two very
-- different jobs: shifting three chairs and moving a four-bedroom house
-- cannot share a price.
--
-- What this does NOT do: turn van sizes into services. The vehicle is
-- already a dimension of the transport price matrix - route_prices is
-- keyed by vehicle and distance band, and the booking flow asks for it
-- on the Route step. Small van / small truck / big truck as separate
-- services would make a provider price the same matrix three times,
-- make a client pick a vehicle twice, and show one firm with two
-- vehicles as two separate listings. The split is by kind of job; the
-- vehicle is a choice inside it.
--
-- Nothing keeps its old id. moving stays "moving" and tr_move stays
-- "tr_move" - changing either would cut the link to provider_trades,
-- provider_services and every past booking. Only names and shelves
-- move.
--
-- Run the whole file in one go. Safe to run twice.
-- =====================================================================


-- 1. The category.
insert into trade_categories (id, name, icon, description, colour, sort_order, active)
values ('removals', 'Moving & delivery', '🚚',
        'Small moves, single items, whole homes, packing help',
        '#0D9488',
        (select coalesce(max(sort_order), 0) + 1 from trade_categories),
        true)
on conflict (id) do update
  set name = excluded.name,
      icon = excluded.icon,
      description = excluded.description,
      colour = excluded.colour;



-- 2. The existing trade moves shelf and gets an honest name.
-- pricing goes to fixed because its service is a transport service,
-- priced by route - it was marked hourly, which never matched.
update trades
   set category_id = 'removals',
       name        = 'Man and van',
       description = 'A few items, kerbside to kerbside',
       pricing     = 'fixed',
       sort_order  = 1,
       updated_at  = now()
 where id = 'moving';


-- 3. Two more trades on the same shelf.
-- House moves is its own trade, not a service under Man and van: a man
-- with a van is not a removals firm, and keeping them apart means the
-- heavier one can be approved separately, and later asked for proof.
-- Packing help is its own too, because it needs no vehicle at all -
-- folding it into Man and van would imply one.
insert into trades (id, category_id, name, icon, description, pricing,
                    roadside, live, sort_order, active)
values
  ('house_move',   'removals', 'House moves',   '🏠',
   'A whole flat or house, surveyed and quoted', 'fixed', false, false, 2, true),
  ('packing_help', 'removals', 'Packing help',  '📦',
   'Hands and boxes, no vehicle needed',          'hourly', false, false, 3, true)
on conflict (id) do update
  set category_id = excluded.category_id,
      name        = excluded.name,
      description = excluded.description,
      pricing     = excluded.pricing,
      sort_order  = excluded.sort_order,
      updated_at  = now();


-- 4. The existing service gets a name a client understands.
-- "Transport" told nobody what they were buying.
update service_types
   set name        = 'Small move',
       description = 'A few items between two addresses. Kerbside to kerbside - loading and unloading is yours unless you agree otherwise with the driver.',
       sort_order  = 1
 where id = 'tr_move';


-- 5. Three new services.
-- The transport one is copied field for field off tr_move, because that
-- shape is what booking.tsx and the pricing functions already handle:
-- is_transport true, pricing_model fixed, labour and parts at zero
-- because the figure comes out of route_prices.
--
-- category is left as 'outdoor' to match its sibling. That column is
-- legacy - trade_id superseded it - and changing it on a live table
-- would risk a screen that still filters by it for the sake of tidiness.
insert into service_types (
  id, trade_id, name, description, icon, category,
  pricing_model, is_transport, needs_location,
  multiplier, min_hours, base_minutes, typical_minutes,
  labour_price, parts_price, callout_fee,
  price_min, price_max, quote_prompt,
  sort_order, active
) values

  -- a single item, same van, same matrix
  ('mv_item', 'moving', 'Single item delivery',
   'One thing, two addresses. A sofa, a fridge, a washing machine.',
   '🛋', 'outdoor',
   'fixed', true, false,
   1, 0, 60, 60,
   0, 0, 0,
   null, null, null,
   2, true),

  -- a whole home: nobody prices this without seeing it
  ('mv_house', 'house_move', 'Whole home move',
   'A full flat or house. Your mover looks at what there is, then sends a price.',
   '🏠', 'outdoor',
   'quote', false, true,
   1, 0, 240, 240,
   0, 0, 0,
   null, null,
   'How many rooms, which floor, is there a lift, and do you want packing included?',
   1, true),

  -- labour only
  ('mv_packing', 'packing_help', 'Packing and loading',
   'Hands for the day. Boxing up, carrying, loading a van you have already sorted.',
   '📦', 'outdoor',
   'hourly', false, true,
   1, 2, 120, 120,
   0, 0, 0,
   null, null, null,
   1, true)

on conflict (id) do update
  set trade_id      = excluded.trade_id,
      name          = excluded.name,
      description   = excluded.description,
      pricing_model = excluded.pricing_model,
      is_transport  = excluded.is_transport,
      needs_location= excluded.needs_location,
      min_hours     = excluded.min_hours,
      base_minutes  = excluded.base_minutes,
      typical_minutes = excluded.typical_minutes,
      quote_prompt  = excluded.quote_prompt,
      sort_order    = excluded.sort_order,
      active        = excluded.active;


-- 6. What it looks like now.
select t.sort_order as sira, t.id as is_kolu, t.name as is_kolu_adi,
       t.pricing, t.live,
       s.id as servis, s.name as servis_adi,
       s.pricing_model, s.is_transport
  from trades t
  left join service_types s on s.trade_id = t.id and s.active
 where t.category_id = 'removals'
 order by t.sort_order, s.sort_order;
