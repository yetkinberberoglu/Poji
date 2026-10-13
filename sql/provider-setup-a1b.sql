/* =====================================================================
   A1b - Stop handing out a trade nobody picked.

   cleaner_profiles.categories carried a column default of
   '{cleaning}'. On its own that was only untidy. Combined with
   guard_cleaner_profile, which freezes that column so only
   sync_provider_categories may write it, it became permanent: any row
   created without an explicit categories value got {cleaning}, and
   from then on every update was silently reverted. A provider who
   picked four trades stayed a cleaner for good.

   Found on 13 October, on a real signup. The provider was shown as a
   cleaner, had no provider_trades rows at all, and the column held a
   single value they had never chosen.

   The column is derived now - a trigger writes it from the approved
   rows in provider_trades - so it has no business having a default.
   Empty is the honest answer for someone with nothing approved yet.

   Existing rows are left alone. The four test accounts really are
   cleaners, and the one wrong row fixes itself the moment that
   provider declares their trades through declare_trades, which goes
   through the trigger and therefore past the guard.
   ===================================================================== */

alter table public.cleaner_profiles
  alter column categories drop default;

comment on column public.cleaner_profiles.categories is
  'DERIVED. Written only by sync_provider_categories from approved provider_trades rows, and frozen against every other writer by guard_cleaner_profile. Do not write it directly - use declare_trades or request_trade.';

notify pgrst, 'reload schema';

/* Expect column_default to come back null. */
select column_name, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'cleaner_profiles'
   and column_name  = 'categories';
