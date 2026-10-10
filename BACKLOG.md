# Poji — açık işler

Son güncelleme: 10 Ekim 2026 akşamı.

---

## Yarın kaldığımız yer

Saatlik ücretin servis başına olması işi 5 adımlıydı, üçü bitti:

| Adım | Durum |
|---|---|
| 1. SQL — `provider_services.hourly_rate`, `min_hours`, `poji_hourly_rate()`, `price_booking` ve insert tetikleyicisi | **bitti** |
| 2. `lib/services.ts` — `effectiveService` üçüncü parametreyi alıyor, `hourlyRate`/`minHours`/`ownRate`/`multiplier` döndürüyor | **bitti** |
| 3. `app/my-services.tsx` — saatlik servislere ücret ve minimum alanı | **bitti, test edilmedi** |
| 4. `app/booking.tsx` — müşteri akışı hesap ücreti yerine servis ücretini kullanacak | sırada |
| 5. `app/(provider)/profile.tsx` — oradaki ücret bölümü "varsayılan" diye adlandırılacak | sırada |

**3. adımın testi yapılmadı.** Senin iş kollarında saatlik olan yok (fuel sabit, dj birim, chef teklif). Test için kendi hesabınla `Cleaning` talep edip admin olarak onayla, sonra **My services and prices** → Cleaning grubunda:

- kartta `€15/hr · from your profile` yazmalı
- **Change my price ›** butonu olmalı (eskiden saatlik servislerde hiç yoktu)
- 25 yazınca önizleme "2 saatlik iş — müşteri öder €51,75, sen alırsın €40,00" demeli
- kaydedince kart `€25/hr` demeli, "from your profile" kaybolmalı

4. adımın önemli kuralı: **sağlayıcı o servis için ücret girdiyse `multiplier` 1 olur.** Çarpan genel ücreti zor iş için yükseltmek içindir; o servisi kendisi fiyatlamışsa zaten hesaba katmıştır, tekrar çarpmak aynı şeyi iki kere ücretlendirir. `effectiveService` bunu zaten doğru döndürüyor, `booking.tsx`'in `baseRate × multiplier` yerine onu okuması lazım.

---

## Bugün kapanan işler

**Para hesabı sunucuya geçti.** `price_new_booking()` tetikleyicisi INSERT anında `price_ex_vat`, `vat_amount`, `stripe_fee`, `total_price`, `provider_payment`, `platform_commission` ve `commission_rate`'i yazıyor. Daha önce INSERT korumasızdı: istemci ne yazarsa yazıyordu ve `guard_booking` onu sonsuza kadar donduruyordu. İstemcide sabit %18 VAT ve sabit %20 komisyonla hesaplanıyordu — €200'lük işte sağlayıcıya €135,79 yazıyordu, doğrusu €160.

- İstemcideki on üç nokta temizlendi: `AppContext.tsx` (8), `(provider)/jobs.tsx` (5), `(provider)/earnings.tsx` (3), `constants/theme.ts`'teki ölü `calcPrice` silindi, `join.tsx` ve `(provider)/profile.tsx` önizlemeleri düzeltildi
- `providerEarnings()` diye tek bir yardımcı: `final_provider_payment ?? provider_payment`, aritmetik yok
- Komisyon oranı rezervasyona donuyor — yarın oranı değiştirsen bugün anlaşılan iş etkilenmiyor
- Promosyon indirimi Poji'nin komisyonundan çıkıyor, sağlayıcının rakamı yerinde kalıyor
- Saatlik sayaç (`jobs.tsx`) artık işin dondurulmuş oranını kullanıyor, sabit %20'yi değil
- `earnings.tsx`'teki "How payouts work" metni yeniden yazıldı — eskisi "senin adına VAT faturası kesiyoruz" diyordu, artık doğru değil ve yanlış beyan sayılırdı

**İş kolu artık veriliyor, seçilmiyor.** `provider_trades` tablosu gerçek kaydı tutuyor, bir tetikleyici `cleaner_profiles.categories`'i sadece onaylılardan yeniden üretiyor — yedi okuyucu ekrana dokunmadan hepsi onaylı listeyi görüyor. `guard_cleaner_profile` `categories`'e doğrudan yazmayı donduruyor.

- Sağlayıcı iş kolu **talep ediyor**: süre seçimi + en az 100 karakterlik açıklama mektubu
- Admin sırası `admin-trades` ekranının başında: mektup, süre, ve sağlayıcının **zaten onaylı olduğu iş kolları** ("tesisatçı, aşçı olmak istiyor" tek bakışta)
- Red sebebi yazılıyor, sağlayıcı görüyor, mektubu kutuda kalıyor
- `trades.requires_proof` + `proof_label` — hangi iş kolunun belge istediğini `admin-trades`'ten ayarlıyorsun
- `admin.tsx` başlığındaki **Trades** butonunda bekleyen sayısı

---

## Sırada bekleyenler

### 1. Mesajlaşma anlık değil, okundu bilgisi yok
**Öncelik: yüksek.** Realtime abonelik (`lib/quotes.ts`'teki `watchQuotes` deseni hazır), `messages.read_at`, okunmamış sayacı, tek/çift tik. Supabase'de `messages` tablosu için realtime yayının açık olduğunu kontrol et.

### 2. Sağlayıcılara yönelik tanıtım dokümanı
**Öncelik: yüksek — tedarik olmadan platform yok.** Tek sayfa: işi nasıl alıyor, parayı ne zaman alıyor, komisyon ne, kaydolmak bedava. Artık doğru rakamlarla yazılabilir.

### 3. Tiler akışı fazla uzun
**Hızlı kazanç.** İki soru yeter: iş yeri mi ev mi, kaç metrekare. `service_types.questions` içinde veri değişikliği.

### 4. Belge yükleme, iş kolu başına
`provider_trades.documents` kolonu var ve `request_trade` belgeyi kabul ediyor, ama ekranda yükleme yok — sağlayıcı şimdilik "Documents and identity"ye yönlendiriliyor ve o belgeler iş koluna bağlanmıyor. Belge isteyen bir iş kolunu canlıya almadan önce bu gerekli.

### 5. İnşaat firmaları ve büyük işler
Karar verilmedi. Müşteri parasını haftalarca tutmak AB'de ödeme kuruluşu lisansı gerektiriyor, şahıs ve kişisel Stripe hesabıyla yapılamaz. Önerilen yön: küçük işte Poji kasiyer, büyük işte sadece eşleştirici — müşteri ile firma doğrudan, Poji kabul edilen teklif üzerinden %2–3 veya sabit ilan ücreti. Ayrıca "ana yüklenici" diye ayrı bir sağlayıcı tipi gerekiyor; bir firma altı ayrı iş kolu olarak kaydolmamalı.

### 6. Havuz fiyatında sağlayıcının kendi fiyatı geçersiz
**Karar bekliyor.** Havuza bırakılan yol yardımı işinde sağlayıcı atanmamış olduğu için fiyat servisin varsayılanından geliyor. Sen profilinde 40 yazdın, müşteri 25+15 ödedi, sen o taban üzerinden alacaksın. Acil yol yardımında tek fiyat mantıklı — ama o zaman `my-services`'te yol yardımı servislerinde fiyat alanı kilitli olsun ve "havuz fiyatı, platform belirler" yazsın. Yoksa ilk şikayet buradan gelir.

### 7. `fuel_delivery` fiyat çelişkisi
`labour_price` 25, `fixed_price` 40. Uygulama 25'i kullanıyor (callout 15 ile toplam 40, o yüzden fark görünmüyor). `fixed_price` eski artık bir kolon, bir ara temizlenmeli.

### 8. Baştan sona akış denetimi — 33 iş kolu
Sağlayıcı gibi tek tek gezip mantıksız adımları ayıklama turu. Her soruda "bu gerçekten fiyatı etkiliyor mu" sorusu.

### 9. Şirket ve mağazalar
App Store ve Google Play için şirket şart değil, şahıs olarak açılıyor (Apple yıllık ~99 $, Google tek seferlik 25 $). `eas build` aynı koddan iki paket çıkarıyor. Dikkat: AB'de Apple tüccar bilgisini mağaza sayfasında gösteriyor, şahıs olarak kaydolursan ev adresin görünür. Yayına yakın teyit et.

---

## Daha küçük, ama durmasın

- PWA servis çalışanı: `skipWaiting` + `clients.claim` + güncelleme uyarısı. Telefonunda eski paket servis edilmesinin sebebi bu.
- Eski `cleaners` tablosu silinecek — 6 uydurma profil, hiçbir yerden referans alınmıyor, EU/MCCAA açısından da sakıncalı.
- Yeniden adlandırma 2. ve 3. aşama: `reviews.cleaner_id`, sonra `cleaner_profiles` → `provider_profiles`.
- `service_types` için admin düzenleme ekranı.
- `poji_settle_hourly` servis bazlı komisyon almıyor, hep `poji_rates()` varsayılanını kullanıyor. `poji_settle_fixed` alıyor. Saatlik bir iş koluna özel komisyon vermek istersen bu gerekli.
- Stripe Connect başvurusunda "işçilikte %20, parçada %5" demişsin; inşaatta %10'a indirdik, beyanla platform artık birebir aynı değil.
- `chef` iş kolu için gıda hijyeni belgesi — `requires_proof` alanı hazır, hangi iş kollarının Malta'da belge gerektirdiğini teyit edip işaretlemek lazım.
