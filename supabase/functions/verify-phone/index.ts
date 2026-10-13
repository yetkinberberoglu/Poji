// Supabase Edge Function — telefon dogrulama, Twilio Verify uzerinden SMS.
// Deploy:  supabase functions deploy verify-phone
//
// Neden SMS, neden WhatsApp degil:
// Yeni kaydolan biri tanimi geregi bize hic yazmamistir, ve WhatsApp
// musteri yazmadan serbest metin gondermeye izin vermez. Yani dogrulama,
// WhatsApp'in en yasakladigi durumdur. Ustelik WhatsApp'tan gonderirsek
// "bu numarada WhatsApp var mi" sorusunu dogrulamis oluruz, numarayi degil.
//
// Neden Twilio Verify, neden kendi kodumuz degil:
// Kodun uretimi, suresi, deneme limiti ve kilitlenmesi guvenlik islerdir.
// Verify bunlari yonetiyor ve biz hicbir kod saklamiyoruz — saklamadigin
// sey sizdiramaz.
//
// Gereken secret'lar:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_VERIFY_SERVICE_SID   <- yeni, VA... ile baslar

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_SID     = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN   = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const VERIFY_SERVICE = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Malta numarasina cevirir. Istemci tarafi zaten dogruluyor, ama istemciye
 * guvenmek diye bir sey yok: buraya gelen her sey yeniden kontrol edilir.
 */
function normalise(raw: string): string | null {
  const cleaned = String(raw || '').replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  // Basinda + yoksa ve 8 haneli ise Malta kabul et (79xxxxxx, 99xxxxxx)
  const e164 = cleaned.startsWith('+')
    ? cleaned
    : cleaned.length === 8 ? `+356${cleaned}` : `+${cleaned}`;
  // E.164: + ve 8-15 hane
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

async function twilioVerify(path: string, form: Record<string, string>) {
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE}/${path}`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    },
  );
  return { ok: res.ok, status: res.status, json: await res.json() };
}

/** Twilio'nun hata kodlarini kullaniciya soylenebilir bir cumleye cevirir. */
function friendly(code: number | undefined, fallback: string) {
  switch (code) {
    case 60200: return { error: 'That number does not look right. Check it and try again.' };
    case 60203: return { error: 'Too many codes sent to that number. Try again in a few minutes.', retryIn: 300 };
    case 60202: return { error: 'Too many wrong codes. Ask for a new one.', retryIn: 60 };
    case 60205: return { error: 'We cannot send SMS to that number.' };
    case 20404: return { error: 'That code has expired. Ask for a new one.' };
    case 60212: return { error: 'Too many attempts from this number. Try again later.', retryIn: 600 };
    default:    return { error: fallback };
  }
}

/**
 * Hangi tabloda duruyor? Musteri ve saglayici ayri tablolarda, ve send
 * aninda hangisi oldugunu profiles.role soyluyor.
 */
async function profileTable(admin: any, userId: string): Promise<'client_profiles' | 'cleaner_profiles'> {
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'cleaner' ? 'cleaner_profiles' : 'client_profiles';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!TWILIO_SID || !TWILIO_TOKEN || !VERIFY_SERVICE) {
    // Yapilandirilmamis halde "kod gonderildi" demek, eskiden oldugu gibi
    // insani gelmeyecek bir kodu beklerken birakir. Dogrusunu soyluyoruz.
    return reply({ ok: false, error: 'Phone confirmation is not switched on yet.' });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Kim oldugunu token soyluyor, istemci degil.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return reply({ ok: false, error: 'Please sign in again.' }, 401);

    const { action, phone, code } = await req.json();
    const table = await profileTable(admin, user.id);

    // ── kod gonder ──
    if (action === 'send') {
      const to = normalise(phone);
      if (!to) return reply({ ok: false, error: 'That number does not look right.' });

      /* Numarayi simdi yaziyoruz, dogrulanmamis olarak. Iki isi birden
         yapiyor: check adiminda hangi numaraya kod gittigini sunucudan
         okuyabiliyoruz (istemcinin soylemesine guvenmiyoruz), ve kayit
         yarida kalsa bile numara elimizde kaliyor. */
      await admin.from(table).upsert(
        { id: user.id, phone: to, phone_verified: false },
        { onConflict: 'id' },
      );

      const r = await twilioVerify('Verifications', { To: to, Channel: 'sms' });
      if (!r.ok) {
        console.log('verify send failed', r.status, r.json);
        return reply({ ok: false, ...friendly(r.json?.code, 'Could not send the code. Try again.') });
      }
      return reply({ ok: true, status: r.json?.status });
    }

    // ── kodu kontrol et ──
    if (action === 'check') {
      const digits = String(code || '').replace(/\D/g, '');
      if (digits.length < 4) return reply({ ok: false, error: 'Enter the code we sent.' });

      /* Hangi numara oldugunu istemci soylemiyor — send adiminda yazdigimiz
         satirdan okuyoruz. Boylece kimse baskasinin numarasini dogrulatmak
         icin gonderdigi govdeyi degistiremez. */
      const { data: row } = await admin.from(table)
        .select('phone, phone_verified').eq('id', user.id).maybeSingle();
      const to = normalise(row?.phone || '');
      if (!to) return reply({ ok: false, error: 'Ask for a new code first.' });
      if (row?.phone_verified) return reply({ ok: true, already: true, phone: to });

      const r = await twilioVerify('VerificationCheck', { To: to, Code: digits });
      if (!r.ok) {
        console.log('verify check failed', r.status, r.json);
        return reply({ ok: false, ...friendly(r.json?.code, 'That code did not work.') });
      }
      if (r.json?.status !== 'approved') {
        return reply({ ok: false, error: 'That code did not work. Check the digits or ask for a new one.' });
      }

      /* Dogrulandi bilgisini SUNUCU yaziyor. Eskiden bunu istemci kendi
         satirina yaziyordu, yani hic kod girmeden "dogrulandi" demek
         mumkundu — dogrulama suslemeden ibaretti. */
      const { error: upErr } = await admin.from(table)
        .update({ phone: to, phone_verified: true }).eq('id', user.id);
      if (upErr) {
        console.log('verify save failed', upErr.message);
        return reply({ ok: false, error: 'Confirmed, but we could not save it. Try once more.' });
      }

      return reply({ ok: true, phone: to });
    }

    return reply({ ok: false, error: 'Unknown action.' }, 400);

  } catch (e) {
    console.log('verify-phone error', String(e));
    return reply({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
});
