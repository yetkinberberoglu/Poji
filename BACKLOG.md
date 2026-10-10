# Poji — açık işler

10 Ekim 2026'da konuşulanlar. Sıra, yukarıdan aşağı değil; "Öncelik" sütununa bak.

---

## 1. Mesajlaşma anlık değil, okundu bilgisi yok

**Öncelik: yüksek — güven kırıcı.** Sağlayıcı mesajı 30 saniye sonra görürse müşteri terk eder.

- Mesajlar realtime abonelikle gelmeli, yoklama (polling) ile değil. Örnek desen hazır: `lib/quotes.ts` içindeki `watchQuotes` Supabase realtime kullanıyor, aynısı mesajlara uygulanacak.
- `messages` tablosuna `read_at timestamptz` — alıcı sohbeti açtığında damgalanır.
- Sohbet listesinde okunmamış sayacı, baloncukta tek/çift tik.
- Kontrol: realtime yayın `messages` tablosu için Supabase'de açık mı (`alter publication supabase_realtime add table messages`).

## 2. Sağlayıcılara yönelik tanıtım dokümanı

**Öncelik: yüksek — tedarik olmadan platform yok.** Tek sayfa, "neden Poji'ye kaydolmalıyım".

İçermesi gerekenler: işi nasıl aldığı, parayı ne zaman aldığı, komisyonun kaçı, kimin müşteri bulduğu, kaydolmanın bedava olduğu. Rozie ile kıyas değil — onlarda olmayan şey: iş kolu başına kendi fiyatını kendisi giriyor.

## 3. Baştan sona akış denetimi — 33 iş kolu

**Öncelik: orta, ama sürekli.** Sağlayıcı gibi tek tek gezip mantıksız adımları ayıklama turu. Her iş kolunda sorulan soruların gerçekten fiyatı etkileyip etkilemediğine bakılacak; etkilemiyorsa silinecek.

## 4. Tiler akışı fazla uzun

**Öncelik: hızlı kazanç.** Şu anda sadece ev seçenekleri var ve gereksiz soru çok. İki soru yeterli:

1. İş yeri mi, ev mi?
2. Kaç metrekare?

Gerisi silinecek. `service_types.questions` içinde veri değişikliği, kod değişikliği değil.

## 5. İnşaat firmaları ve büyük işler

**Öncelik: düşünme işi, kod değil.** Bir firma duvar, sıva, boya, fayans, tesisat, elektrik işlerini kendi ekibiyle A'dan Z'ye yapabiliyor. İki ayrı sorun:

- **Kart tutma çalışmıyor.** 15.000 €'ya blokaj koyulamaz; kart limiti yetmez, Stripe'ın ön provizyonu 7 günde düşer. Büyük iş = sözleşme, sonra hakediş veya taksit.
- **Firma 6 ayrı iş kolu olarak kaydolmamalı.** "Ana yüklenici" diye ayrı bir sağlayıcı tipi gerekiyor.

Önerilen yön: büyük işlerde Poji kasiyer değil, eşleştirici. Ayrıntı için aşağıdaki "Büyük işler modeli" bölümü.

## 6. Sağlayıcı tek tıkla meslek değiştirebiliyor

**Öncelik: yüksek — güvenlik deliği.** Fayansçıyken aşçı veya DJ olunabiliyor. Üç ayrı risk: belge gerektiren işler (aşçı — gıda hijyeni, elektrikçi — ehliyet, gaz), bir iş kolunda kazanılan puanın başka iş koluna taşınması, bir iş kolunda askıya alınanın başka iş kolunda yeniden görünmesi.

Çözüm şekli:

- `provider_trades` ayrı tablo: `provider_id`, `trade_id`, `status` (`pending`/`approved`/`rejected`/`suspended`), `approved_at`, `approved_by`, `documents`.
- Profil ekranı `categories`'e doğrudan yazamaz; iş kolu **talep eder**, admin onaylar.
- Fiyat, yarıçap, müsaitlik değişimi serbest kalır — sağlayıcının kendi işi.
- Puanlar iş kolu başına tutulmalı, yoksa 5 yıldızlı fayansçı 5 yıldızlı aşçı gibi görünür.
- Admin tarafı sıfırdan değil: `admin.tsx` zaten başvuru onay/ret mekanizmasına sahip, o genişletilecek.

## 7. Şirket ve mağazalar

**Öncelik: paralel yürür.** App Store ve Google Play'e girmek için şirket şart değil — şahıs olarak da yayınlanabiliyor. Ayrıntı aşağıda.

---

## Büyük işler modeli (madde 5'in açılımı)

Sektördeki platformların büyük işte para taşımamasının sebebi bu: müşteri parasını haftalarca tutmak AB'de düzenlemeye tabi (ödeme kuruluşu / e-para lisansı). Şahıs ve kişisel Stripe hesabıyla yapılamaz.

Bu yüzden tek uygulama, **iki iş modeli**:

| | Küçük/orta iş | Büyük iş / proje |
|---|---|---|
| Kapsam | Mevcut 33 iş kolu | İnşaat, komple tadilat, çok kalemli iş |
| Eşik | ~2.000 €'ya kadar | Üstü, veya "çok kalemli" işaretliyse |
| Para | Kartta, Poji üzerinden | Müşteri ile firma arasında, doğrudan |
| Poji'nin kazancı | Komisyon | Sabit ilan/lead ücreti ya da kabul edilen teklif üzerinden küçük başarı payı (%2–3) |
| Poji'nin verdiği | Ödeme, mutabakat, zamanlayıcı | Kapsam şablonu, teklif karşılaştırma, hakediş listesi |

Başarı payında firma işi platform dışına kaçırmaya çalışır. Panzehir: pay, müşteri teklifi **uygulama içinde kabul ettiği an** hesaplanır (teklif sistemi zaten var ve bu anı görüyor), oran kaçırmaya değmeyecek kadar küçük tutulur. Hacim sıfırken en sağlıklısı: ilk dönem bedava, önce tedarik.

## Mağazalar (madde 7'nin açılımı)

- Apple geliştirici hesabı yıllık ~99 $, Google Play tek seferlik 25 $. İkisi de şahıs olarak açılabilir, şirket gerekmez.
- Kod hazır: Expo 51 üzerindeyiz, `eas build` aynı kaynaktan iOS ve Android paketi üretir. Gün meselesi, ay değil.
- Apple'ın uygulama içi satın alma zorunluluğu **dijital** ürünler için; Poji fiziksel hizmet sattığı için kendi ödeme akışını kullanabilir.
- Dikkat: AB'de Apple "tüccar bilgisi" (ad, adres, telefon) istiyor ve bunu mağaza sayfasında gösteriyor. Şahıs olarak kaydolursan ev adresin görünebilir. İş adresi olan bir yapı burada fark yaratıyor. Bu kuralların güncel halini yayına yakın bir zamanda teyit etmek lazım.

---

## Daha önceki listeden devam edenler

- `AppContext.tsx:421` sağlayıcı ödemesini `exVat * 0.80` yazıyor — sabit %20 komisyon. `bookings.commission_rate` okunmalı; yoksa DJ işinde sağlayıcıya %10 eksik yazılır.
- `chef` iş kolu için onboarding'de gıda hijyeni belgesi.
- PWA servis çalışanı: `skipWaiting` + `clients.claim` + güncelleme uyarısı. Telefonunda eski paket servis edilmesinin sebebi bu.
- Eski `cleaners` tablosu silinecek — 6 uydurma profil, hiçbir yerden referans alınmıyor.
- Yeniden adlandırma 2. ve 3. aşama: `reviews.cleaner_id`, sonra `cleaner_profiles` → `provider_profiles`.
- `service_types` için admin düzenleme ekranı.
