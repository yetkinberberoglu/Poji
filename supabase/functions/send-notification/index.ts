// Supabase Edge Function — sends WhatsApp messages via Twilio
// Deploy:  supabase functions deploy send-notification

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM  = Deno.env.get('TWILIO_WHATSAPP_FROM')!; // e.g. whatsapp:+14155238886

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Message templates ──
function buildMessage(template: string, d: Record<string, any>): string {
  switch (template) {
    case 'new_job_offer':
      if (d.model === 'quote') {
        return `💬 *New request — they need a price*\n\n`
          + `📍 ${d.address}\n`
          + `📅 ${d.date} at ${d.time}\n\n`
          + `Message them, work out what the job is, then send your quote. `
          + `Don't travel until they accept.\n\n`
          + `Open Poji: ${d.appUrl}`;
      }
      return `🔔 *New job for you*\n\n`
        + `📍 ${d.address}\n`
        + `📅 ${d.date} at ${d.time}\n`
        + (d.model === 'fixed' ? `` : `⏱ about ${d.hours}h\n`)
        + (d.earnings ? `💶 You'd earn €${Number(d.earnings).toFixed(2)}\n` : '')
        + `\nYou have first refusal for 5 minutes, then it goes to everyone.\n\n`
        + `Open Poji: ${d.appUrl}`;


    case 'job_in_pool':
      return `🌐 *Job available on Poji*\n\n`
        + `📍 ${d.address}\n`
        + `📅 ${d.date} at ${d.time}\n`
        + `⏱ ${d.hours}h\n\n`
        + `💰 *You earn €${Number(d.earnings).toFixed(2)}*\n\n`
        + `First to accept gets it: ${d.appUrl}`;

    case 'booking_confirmed':
      return `✅ *Booking confirmed*\n\n`
        + `${d.cleanerName} accepted your job.\n\n`
        + `📅 ${d.date} at ${d.time}\n`
        + `📍 ${d.address}\n\n`
        + `We'll let you know when they're on the way.`;

    case 'cleaner_on_way':
      return `🚗 *${d.cleanerName} is on the way*\n\n`
        + `They'll arrive shortly at ${d.address}.\n\n`
        + `Open Poji to see your PIN when they arrive.`;

    case 'cleaner_arrived':
      return `🔐 *${d.cleanerName} has arrived*\n\n`
        + `Your PIN is *${d.pin}*\n\n`
        + `Give it to them to start the job.`;

    case 'job_finished':
      return `👀 *Job finished*\n\n`
        + `${d.cleanerName} marked the job as complete.\n\n`
        + `Please check the work and confirm in the app.\n`
        + `If you don't respond within 6 hours it's approved automatically.\n\n`
        + `${d.appUrl}`;

    case 'quote_sent':
      return `💬 *${d.cleanerName} has quoted you*\n\n`
        + `*€${d.amount}* all in.\n\n`
        + (d.note ? `"${d.note}"\n\n` : '')
        + `Nothing is charged until the work is done and you approve it. `
        + `Open Poji to accept or decline: ${d.appUrl}`;

    case 'quote_accepted':
      return `✅ *Quote accepted*\n\n`
        + `€${d.amount} · ${d.date} at ${d.time}\n`
        + `📍 ${d.address}\n\n`
        + `You're good to go.`;

    case 'quote_declined':
      return `😕 *The client declined your quote*\n\n`
        + `${d.address} — the job is cancelled. Nobody travelled, nobody is charged.`;

    case 'time_proposed':
      return `📅 *${d.cleanerName} suggests another time*\n\n`
        + `You asked for ${d.oldDate} at ${d.oldTime}.\n`
        + `They can come *${d.newDate} at ${d.newTime}* instead.\n\n`
        + (d.note ? `"${d.note}"\n\n` : '')
        + `Open Poji to accept or find someone else: ${d.appUrl}`;

    case 'time_accepted':
      return `✅ *New time confirmed*\n\n`
        + `${d.date} at ${d.time}\n`
        + `📍 ${d.address}\n\n`
        + `See you then.`;

    case 'time_declined':
      return `😕 *That time didn't work for the client*\n\n`
        + `${d.address} on ${d.date} at ${d.time} has gone back to the pool.\n\n`
        + `No hard feelings — plenty more coming.`;

    case 'job_completed':
      return `🎉 *Job completed*\n\n`
        + `€${Number(d.earnings).toFixed(2)} will be paid to your account.\n\n`
        + `Thanks for working with Poji.`;

    case 'application_approved':
      return `🎉 *You're verified on Poji!*\n\n`
        + `Your profile is live. Clients can now book you.\n\n`
        + `Open the app: ${d.appUrl}`;

    case 'application_rejected':
      return `⚠️ *Your Poji application needs changes*\n\n`
        + `${d.reason}\n\n`
        + `Update your details and resubmit: ${d.appUrl}`;

    default:
      return d.body || 'Poji notification';
  }
}

async function sendWhatsApp(to: string, body: string) {
  const cleaned = to.replace(/[^\d+]/g, '');
  const target  = cleaned.startsWith('+') ? cleaned : `+356${cleaned}`;

  const form = new URLSearchParams({
    From: TWILIO_FROM,
    To:   `whatsapp:${target}`,
    Body: body,
  });

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

/** Push rides alongside WhatsApp — whichever reaches them first, wins. */
async function alsoPush(userId: string, kind: string, data: any) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ userId, kind, data }),
    });
  } catch (e) {
    console.log('push alongside failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userId, bookingId, template, data } = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find the recipient's phone number
    let phone: string | null = null;
    let optIn = true;

    const { data: cp } = await supabase
      .from('client_profiles').select('phone, whatsapp_opt_in').eq('id', userId).maybeSingle();
    if (cp?.phone) { phone = cp.phone; optIn = cp.whatsapp_opt_in ?? true; }

    if (!phone) {
      const { data: clp } = await supabase
        .from('cleaner_profiles').select('phone, whatsapp_opt_in').eq('id', userId).maybeSingle();
      if (clp?.phone) { phone = clp.phone; optIn = clp.whatsapp_opt_in ?? true; }
    }

    // Push goes out whatever happens to the WhatsApp side. It costs nothing
    // and it's usually the one they see first.
    alsoPush(userId, template, { ...data, bookingId });

    const body = buildMessage(template, { ...data, appUrl: data?.appUrl || 'https://po-ji.com' });

    // Log the attempt
    const { data: logRow } = await supabase.from('notifications').insert({
      user_id: userId, booking_id: bookingId || null,
      channel: 'whatsapp', template, recipient: phone, body,
      status: 'queued',
    }).select().single();

    if (!phone) {
      await supabase.from('notifications')
        .update({ status: 'failed', error: 'No phone number on file' }).eq('id', logRow.id);
      return new Response(JSON.stringify({ ok: false, reason: 'no_phone' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!optIn) {
      await supabase.from('notifications')
        .update({ status: 'failed', error: 'User opted out' }).eq('id', logRow.id);
      return new Response(JSON.stringify({ ok: false, reason: 'opted_out' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
      const sid = await sendWhatsApp(phone, body);
      await supabase.from('notifications')
        .update({ status: 'sent', provider_id: sid, sent_at: new Date().toISOString() })
        .eq('id', logRow.id);
      return new Response(JSON.stringify({ ok: true, sid }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      await supabase.from('notifications')
        .update({ status: 'failed', error: String(e) }).eq('id', logRow.id);
      return new Response(JSON.stringify({ ok: false, error: String(e) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
