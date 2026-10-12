-- Realtime yayinina tablolari ekler.
--
-- Supabase'in varsayilan hali: supabase_realtime yayini var, ama ICI BOS.
-- Tablolar tek tek eklenmedigi surece her abonelik sessizce kuruluyor ve
-- hic olay almiyor. subscribe() hata vermez, o yuzden fark edilmesi zor.
--
-- 12 Ekim 2026'da bulundu: yayinda hic tablo yoktu. Yani Chat.tsx'teki
-- mesajlasma ve lib/quotes.ts'teki watchQuotes hic canli calismamisti.
-- Mesajlar ve teklifler ancak ekran yeniden kurulunca goruluyordu.
--
-- replica identity full'un sebebi: realtime RLS'i abone kullanici adina
-- yeniden degerlendiriyor. Satirin tamami WAL'a yazilmazsa politikayi
-- kontrol edemez ve olayi gondermez.
--
-- Tekrar calistirilabilir: zaten ekli olani atlar.

do $$
declare r record;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  for r in select unnest(array['messages','quotes']) as tbl loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = r.tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', r.tbl);
    end if;
    execute format('alter table public.%I replica identity full', r.tbl);
  end loop;
end $$;

-- Dogrulama: messages ve quotes gorunmeli.
--   select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' order by 1;
