// Connects two people without either seeing the other's number.
// Poji rings the caller first; when they pick up, Poji rings the other side
// and joins the two. Both phones show the Poji number.
//
// Deploy:  supabase functions deploy bridge-call
// Needs:   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VOICE_FROM

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const VOICE_FROM   = Deno.env.get('TWILIO_VOICE_FROM') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Calls open two hours before the job and stay open until it's done */
function withinWindow(date?: string, time?: string, status?: string) {
  if (['en_route','arrived','in_progress','awaiting_confirmation'].includes(status || ''))
    return true;
  if (!date || !time) return false;
  const start = new Date(`${date}T${time}:00`);
  if (isNaN(start.getTime())) return false;
  return start.getTime() - Date.now() <= 2 * 3600 * 1000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!VOICE_FROM) {
      return reply({ ok:false, error:'Calling is not configured' }, 501);
    }

    const { bookingId } = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!jwt) return reply({ ok:false, error:'Not signed in' }, 401);
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user) return reply({ ok:false, error:'Not signed in' }, 401);

    const { data: b } = await supabase
      .from('bookings')
      .select('id, client_id, cleaner_id, date, start_time, status')
      .eq('id', bookingId).maybeSingle();

    if (!b) return reply({ ok:false, error:'No such booking' }, 404);

    const isClient   = b.client_id === user.id;
    const isProvider = b.cleaner_id === user.id;
    if (!isClient && !isProvider) {
      return reply({ ok:false, error:'That job is not yours' }, 403);
    }

    if (!withinWindow(b.date, b.start_time, b.status)) {
      return reply({ ok:false, error:'Calling opens two hours before the job' }, 403);
    }

    const callerId = user.id;
    const otherId  = isClient ? b.cleaner_id : b.client_id;
    if (!otherId) return reply({ ok:false, error:'Nobody assigned yet' }, 400);

    const { data: people } = await supabase
      .from('profiles').select('id, phone, phone_verified')
      .in('id', [callerId, otherId]);

    const caller = people?.find(p => p.id === callerId);
    const other  = people?.find(p => p.id === otherId);

    if (!caller?.phone || !other?.phone) {
      return reply({ ok:false, error:'One of you has no confirmed number' }, 400);
    }

    // Ring the caller, and on answer dial the other side into the same call.
    const twiml =
      `<Response>` +
        `<Say voice="alice">Connecting you through Poji. Neither number is shared.</Say>` +
        `<Dial callerId="${VOICE_FROM}" timeLimit="1800" record="do-not-record">` +
          `<Number>${other.phone}</Number>` +
        `</Dial>` +
      `</Response>`;

    const form = new URLSearchParams({
      From: VOICE_FROM,
      To: caller.phone,
      Twiml: twiml,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`,
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
    if (!res.ok) {
      console.error('Twilio call failed', json);
      return reply({ ok:false, error: json.message || 'Could not place the call' }, 502);
    }

    // a record of who rang whom, without either number leaving the server
    await supabase.from('call_log').insert({
      booking_id: bookingId,
      caller_id: callerId,
      callee_id: otherId,
      twilio_sid: json.sid,
    });

    return reply({ ok:true, sid: json.sid });

  } catch (e) {
    console.error(e);
    return reply({ ok:false, error: String(e) }, 500);
  }
});
