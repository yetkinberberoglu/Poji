/* =====================================================================
   B0 - Where a document came from.

   "Sadece kamera" is not a thing a web app can enforce. The capture
   attribute opens the camera by default on a phone and is ignored
   entirely on a desktop, and a photograph of a screen showing a forged
   document is still a photograph. Closing file upload altogether would
   only mean nobody who signs up from a computer can finish.

   So instead of pretending, we record what actually happened and show
   it to the admin. A real photo carries EXIF - a camera make and a
   capture time; a screenshot or a downloaded file usually carries
   neither. That is a signal, not proof, and the review screen says so.

   One jsonb rather than a column per document, because the set of
   documents we ask for will keep changing and this should not need a
   migration every time.

   Shape:
     { "id_front": {"src":"camera","exif":true,"at":"2026-10-13T08:12:00Z"},
       "selfie":   {"src":"file","exif":false,"at":"..."} }
   ===================================================================== */

alter table public.cleaner_profiles
  add column if not exists doc_source jsonb not null default '{}'::jsonb;

comment on column public.cleaner_profiles.doc_source is
  'Per-document provenance: src camera|file, exif true when the file carried camera metadata. A signal for review, never proof.';

/* The provider writes this about their own uploads, so it has to be a
   column they may set - unlike verification_status or the review
   fields, which guard_cleaner_profile freezes. Nothing to do here: the
   guard only freezes what it names, and it does not name this. */

notify pgrst, 'reload schema';

select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'cleaner_profiles'
   and column_name  = 'doc_source';
