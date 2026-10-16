// Supabase Edge Function — sends WhatsApp messages via Twilio
// Deploy:  supabase functions deploy send-notification

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM  = Deno.env.get('TWILIO_WHATSAPP_FROM')!; // e.g. whatsapp:+14155238886

/* Where SMS goes out from when WhatsApp cannot reach somebody. Either a
   Twilio number you own, or an alphanumeric sender ID such as "Poji"
   where the country allows it. Left unset, the fallback does not run and
   says so in the log rather than failing quietly. */
const SMS_FROM = Deno.env.get('TWILIO_SMS_FROM') || '';

/* A shared secret on the status callback URL. Twilio tells us what
   happened to each message by calling us back, and that endpoint has to
   be open to the internet for Twilio to reach it; without this anybody
   could post us a delivery receipt and we would believe it. */
const STATUS_SECRET = Deno.env.get('TWILIO_STATUS_SECRET') || '';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Message templates ──

/** Minutes as somebody would say them out loud. */
function hhmm(m: any): string {
  const n = Math.max(0, Math.round(Number(m) || 0));
  const h = Math.floor(n / 60);
  const r = n % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

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
        /* Said five minutes and "then it goes to everyone". Neither is
           true: the window is an hour, ten minutes when it is urgent,
           and when it runs out the job goes back to the client to
           choose again rather than out to strangers. */
        + `\nIt is yours for ${d.urgent ? '10 minutes' : 'the next hour'}. `
        + `After that the client is asked to choose somebody else.\n\n`
        + `Open Poji: ${d.appUrl}`;


    /* job_in_pool is gone with the pool. A job thrown open to everyone
       was never taken, and anyone who had taken one would have been
       working at a price the client agreed with somebody else. */
    case 'pick_again':
      return `↩ *Your provider has stepped back*\n\n`
        + `📍 ${d.address}\n`
        + `📅 ${d.date} at ${d.time}\n\n`
        + `They can't do this one after all. Nothing has been charged. `
        + `Open Poji and choose somebody else — you'll see who is free `
        + `and what they charge.\n\n`
        + `${d.appUrl}`;

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

    /* An hourly job that ran well past its estimate. The six-hour
       window and the automatic approval are the same as job_finished;
       what is different is that the client is told what it costs while
       they still have those six hours. Being asked to "confirm" without
       being shown the number is not a chance to object. */
    case 'job_overrun':
      return `⏱ *The job took longer than estimated*\n\n`
        + `${d.cleanerName} has finished and marked it complete.\n\n`
        + `Estimated: ${hhmm(d.estimatedMinutes)}\n`
        + `Worked: ${hhmm(d.billedMinutes)}\n`
        + `That adds *€${d.extra}* — total *€${d.total}*.\n\n`
        + `Open Poji to approve it, or raise it with them if that is not `
        + `right. With no answer within 6 hours it is approved `
        + `automatically.\n\n`
        + `${d.appUrl}`;

    case 'quote_sent':
      return `💬 *${d.cleanerName} has quoted you*\n\n`
        + `*€${d.amount}* all in — VAT and card fee included.\n\n`
        + (d.note ? `"${d.note}"\n\n` : '')
        + `You can accept it, make a lower offer, or wait and compare `
        + `other quotes. Nothing is charged until the work is done and `
        + `you approve it.\n\n`
        + `Open Poji: ${d.appUrl}`;

    case 'quote_accepted':
      return `✅ *Quote accepted*\n\n`
        + `€${d.amount} · ${d.date} at ${d.time}\n`
        + `📍 ${d.address}\n\n`
        + `You're good to go.`;

    case 'quote_declined':
      return `😕 *Your quote wasn't chosen*\n\n`
        + `${d.address} — the client went another way this time. `
        + `Nobody travelled, nobody is charged.\n\n`
        + `Plenty more coming: ${d.appUrl}`;

    case 'quote_countered':
      return `💰 *The client made you an offer*\n\n`
        + `📍 ${d.address}\n`
        + `You quoted €${d.yourQuote} — they're offering *€${d.amount}*.\n\n`
        + (d.note ? `"${d.note}"\n\n` : '')
        + `Accept and the job is yours straight away. Say no and your `
        + `original price stays on the table.\n\n`
        + `Open Poji: ${d.appUrl}`;

    case 'counter_accepted':
      return `✅ *${d.cleanerName} accepted your offer*\n\n`
        + `€${d.amount} · ${d.date} at ${d.time}\n`
        + `📍 ${d.address}\n\n`
        + `The job is booked. Your card is only held — money moves after `
        + `you confirm the work is done.`;

    case 'counter_declined':
      return `💬 *${d.cleanerName} is holding their price*\n\n`
        + `Their quote of *€${d.amount}* is still open, so you can `
        + `accept it, or go with another quote.\n\n`
        + `Open Poji: ${d.appUrl}`;

    case 'all_quotes_declined':
      return `🔄 *This job is open again*\n\n`
        + `📍 ${d.address}\n`
        + `📅 ${d.date} at ${d.time}\n\n`
        + `The client didn't go with the quotes they had. If you can do it, `
        + `send yours: ${d.appUrl}`;

    case 'new_message':
      return `💬 *${d.senderName || 'New message'}*\n\n`
        + (d.photo ? `📷 Sent a photo\n\n` : '')
        + (d.preview ? `"${d.preview}"\n\n` : '')
        + `Reply in Poji: ${d.appUrl}`;

    case 'no_show_recorded':
      return `⚠️ *A client reported that you didn't arrive*\n\n`
        + `📍 ${d.address}\n`
        + `📅 ${d.date} at ${d.time}\n\n`
        + `The job has been cancelled and nobody was charged. This is now on your `
        + `record. If something happened, reply here and we'll look at it.\n\n`
        + `Repeated no-shows end in suspension.`;

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

    /* This said the job had "gone back to the pool". There is no pool,
       and there has not been one since the client became the person who
       chooses. It goes back to them. */
    case 'time_declined':
      return `😕 *That time didn't work for the client*\n\n`
        + `${d.address} on ${d.date} at ${d.time} is back with the client, `
        + `who will choose somebody else.\n\n`
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
      // A template we haven't written copy for yet. Never send an empty
      // message — say something true and point them at the app.
      return d.body
        || `🔔 *Poji*\n\nThere's an update on your job.\n\n${d.appUrl}`;
  }
}

/** Malta numbers are often typed without the country code. */
function normalisePhone(to: string) {
  const cleaned = to.replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+356${cleaned}`;
}

/**
 * Hands a message to Twilio and asks to be told what becomes of it.
 *
 * The asking is the point. Twilio accepting a message means only that:
 * accepted. Whether it reached a phone is decided minutes later and was,
 * until now, never told to us — a job offer to a provider whose number
 * was not on WhatsApp came back 'sent' in our own table and 'undelivered'
 * in Twilio's console, and the only way to know which was true was for
 * somebody to go and look. StatusCallback closes that gap.
 */
async function sendTwilio(opts: {
  to: string; body: string; channel: 'whatsapp' | 'sms'; notificationId: string;
}) {
  const target = normalisePhone(opts.to);

  if (opts.channel === 'sms' && !SMS_FROM) {
    throw new Error('No SMS sender configured (TWILIO_SMS_FROM)');
  }

  const form = new URLSearchParams({
    From: opts.channel === 'whatsapp' ? TWILIO_FROM : SMS_FROM,
    To:   opts.channel === 'whatsapp' ? `whatsapp:${target}` : target,
    Body: opts.body,
  });

  /* Only when there is a secret to protect the endpoint with. Sending the
     callback to an open URL would be worse than not asking at all. */
  if (STATUS_SECRET) {
    form.set('StatusCallback',
      `${SUPABASE_URL}/functions/v1/twilio-status`
      + `?n=${encodeURIComponent(opts.notificationId)}`
      + `&k=${encodeURIComponent(STATUS_SECRET)}`);
  }

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
      const sid = await sendTwilio({
        to: phone, body, channel: 'whatsapp', notificationId: logRow.id,
      });
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
