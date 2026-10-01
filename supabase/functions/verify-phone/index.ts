// Sends and checks a 6-digit code over WhatsApp.
// Deploy:  supabase functions deploy verify-phone

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM  = Deno.env.get('TWILIO_WHATSAPP_FROM')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CODE_TTL_MIN   = 10;
const MAX_ATTEMPTS   = 5;
const RESEND_WAIT_S  = 60;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function sendWhatsApp(to: string, body: string) {
  const form = new URLSearchParams({ From: TWILIO_FROM, To: `whatsapp:${to}`, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Twilio error');
  return json.sid as string;
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { action, phone, code } = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // who is calling?
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!jwt) return reply({ ok:false, error:'Not signed in' }, 401);
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user) return reply({ ok:false, error:'Not signed in' }, 401);

    // ── send a code ──
    if (action === 'send') {
      if (!phone || !/^\+[0-9]{8,15}$/.test(phone))
        return reply({ ok:false, error:'That number does not look right' }, 400);

      // don't let them spam it
      const { data: recent } = await supabase
        .from('phone_verifications')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending:false })
        .limit(1);

      if (recent?.[0]) {
        const since = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
        if (since < RESEND_WAIT_S)
          return reply({ ok:false, error:`Wait ${Math.ceil(RESEND_WAIT_S - since)}s before asking again`, retryIn: Math.ceil(RESEND_WAIT_S - since) }, 429);
      }

      const code6 = String(Math.floor(100000 + Math.random() * 900000));
      const hash  = await sha256(code6 + user.id);

      await supabase.from('phone_verifications').insert({
        user_id: user.id,
        phone,
        code_hash: hash,
        expires_at: new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString(),
      });

      await sendWhatsApp(phone,
        `*${code6}* is your Poji verification code.\n\n` +
        `It expires in ${CODE_TTL_MIN} minutes. If you didn't ask for this, ignore it.`
      );

      return reply({ ok:true, sent:true });
    }

    // ── check a code ──
    if (action === 'check') {
      if (!code || !/^[0-9]{6}$/.test(code))
        return reply({ ok:false, error:'Enter the 6-digit code' }, 400);

      const { data: rows } = await supabase
        .from('phone_verifications')
        .select('*')
        .eq('user_id', user.id)
        .is('verified_at', null)
        .order('created_at', { ascending:false })
        .limit(1);

      const row = rows?.[0];
      if (!row) return reply({ ok:false, error:'Ask for a new code' }, 400);

      if (new Date(row.expires_at) < new Date())
        return reply({ ok:false, error:'That code has expired — ask for a new one' }, 400);

      if (row.attempts >= MAX_ATTEMPTS)
        return reply({ ok:false, error:'Too many tries — ask for a new code' }, 429);

      const hash = await sha256(code + user.id);
      if (hash !== row.code_hash) {
        await supabase.from('phone_verifications')
          .update({ attempts: row.attempts + 1 }).eq('id', row.id);
        const left = MAX_ATTEMPTS - row.attempts - 1;
        return reply({
          ok:false,
          error: left > 0 ? `Wrong code — ${left} ${left===1?'try':'tries'} left` : 'Too many tries',
        }, 400);
      }

      const now = new Date().toISOString();
      await supabase.from('phone_verifications')
        .update({ verified_at: now }).eq('id', row.id);

      await supabase.from('profiles')
        .update({ phone: row.phone, phone_verified: true, phone_verified_at: now })
        .eq('id', user.id);

      // mirror it onto whichever profile they have
      await supabase.from('cleaner_profiles')
        .update({ phone_verified: true }).eq('id', user.id);
      await supabase.from('client_profiles')
        .update({ phone_verified: true }).eq('id', user.id);

      return reply({ ok:true, verified:true });
    }

    return reply({ ok:false, error:'Unknown action' }, 400);

  } catch (e) {
    return reply({ ok:false, error: String(e) }, 500);
  }
});
