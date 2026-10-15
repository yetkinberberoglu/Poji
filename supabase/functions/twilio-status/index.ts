// Supabase Edge Function — receives Twilio delivery receipts
// Deploy:  supabase functions deploy twilio-status --no-verify-jwt
//
// Twilio has to be able to reach this without a Supabase token, which is
// why it is deployed with --no-verify-jwt and guarded by a secret in the
// URL instead.
//
// What this is for: Twilio accepting a message and a phone receiving one
// are different events, minutes apart, and we were only ever told about
// the first. A job offer sent to a provider whose number was not on
// WhatsApp sat in our table as 'sent' while Twilio's own console said
// 'undelivered — invalid message recipient'. The provider never knew
// about the work; the client waited for an answer that was never coming;
// nothing in Poji showed anything wrong. This closes that.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STATUS_SECRET = Deno.env.get('TWILIO_STATUS_SECRET') || '';

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const SMS_FROM     = Deno.env.get('TWILIO_SMS_FROM') || '';

/** Twilio stops here: nothing further will happen to the message. */
const DONE_BAD  = ['undelivered', 'failed'];
const DONE_GOOD = ['delivered', 'read'];

/**
 * Why a message did not arrive, in a sentence rather than a number.
 *
 * These end up in front of an admin deciding what to do about a provider
 * who is not getting their jobs, so "63024" is not an answer.
 */
function explain(code: string): string {
  switch (code) {
    case '63024': return 'That number is not on WhatsApp';
    case '63003': return 'We could not find that number at all';
    case '63005': return 'They have blocked us on WhatsApp';
    case '63013': return 'WhatsApp refused the message content';
    case '63014': return 'They blocked business messages';
    case '63016': return 'Outside the 24-hour window — this needs an approved template';
    case '63018': return 'Too many messages sent at once';
    case '30003': return 'Their phone is off or unreachable';
    case '30005': return 'That number does not exist';
    case '30006': return 'That is a landline, or it cannot receive texts';
    case '30007': return 'Their network blocked the message as spam';
    case '21612': return 'We cannot reach that country from this number';
    default:      return code ? `Twilio error ${code}` : 'Not delivered';
  }
}

/** Malta numbers are often typed without the country code. */
function normalisePhone(to: string) {
  const cleaned = String(to || '').replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+356${cleaned}`;
}

async function sendSms(to: string, body: string) {
  const form = new URLSearchParams({
    From: SMS_FROM,
    To:   normalisePhone(to),
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
    },
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Twilio error');
  return json.sid as string;
}

/**
 * WhatsApp formatting, stripped back for a text message.
 *
 * *bold* means nothing over SMS and the emoji are decoration, but the
 * address, the time and the link are the message. Kept short because a
 * long SMS is several SMS.
 */
function plainText(body: string) {
  return String(body || '')
    .replace(/\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

Deno.serve(async (req) => {
  /* Twilio retries anything that is not a 2xx, so this function answers
     200 to everything and keeps its complaints in the log. A retry would
     not fix a problem on our side and would double any fallback. */
  const ok = (what: string) => new Response(what, { status: 200 });

  try {
    const url = new URL(req.url);

    if (!STATUS_SECRET || url.searchParams.get('k') !== STATUS_SECRET) {
      console.log('status callback refused: bad or missing secret');
      return ok('no');
    }

    const notificationId = url.searchParams.get('n');
    const form   = await req.formData();
    const status = String(form.get('MessageStatus') || '').toLowerCase();
    const sid    = String(form.get('MessageSid') || '');
    const code   = String(form.get('ErrorCode') || '');

    if (!notificationId && !sid) return ok('nothing to match');

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    /* Matched by our own row id where we have it, because Twilio reuses
       nothing else we control. The SID is the fallback for anything sent
       before this function existed. */
    const q = supabase.from('notifications').select('*');
    const { data: row } = notificationId
      ? await q.eq('id', notificationId).maybeSingle()
      : await q.eq('provider_id', sid).maybeSingle();

    if (!row) { console.log('status callback: no matching notification', notificationId || sid); return ok('unknown'); }

    const now  = new Date().toISOString();
    const bad  = DONE_BAD.includes(status);
    const good = DONE_GOOD.includes(status);

    await supabase.from('notifications').update({
      status,
      status_at:    now,
      delivered_at: good ? now : null,
      error_code:   code || null,
      error:        bad ? explain(code) : null,
    }).eq('id', row.id);

    /* Not a final answer yet — 'sending', 'queued', 'sent'. Recorded and
       left alone; another callback will come. */
    if (!bad) return ok('noted');

    /* It failed, finally. A WhatsApp message that cannot be delivered is
       not the end of the matter: the person still has not been told
       about their job. Try a text, once. */
    if (row.channel !== 'whatsapp') return ok('failed, no fallback for this channel');
    if (!row.recipient)             return ok('failed, nowhere to fall back to');

    if (!SMS_FROM) {
      console.log('would fall back to SMS but TWILIO_SMS_FROM is not set');
      await supabase.from('notifications')
        .update({ error: explain(code) + ' — no SMS sender is configured, so nothing else was tried' })
        .eq('id', row.id);
      return ok('failed, no sms sender');
    }

    /* Once. If a text has already gone out for this same event, the
       second callback must not send another one. */
    const { data: already } = await supabase.from('notifications')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('template', row.template)
      .eq('channel', 'sms')
      .eq('booking_id', row.booking_id)
      .limit(1);

    if (already && already.length) return ok('already fell back');

    const body = plainText(row.body);

    const { data: smsRow } = await supabase.from('notifications').insert({
      user_id:    row.user_id,
      booking_id: row.booking_id,
      channel:    'sms',
      template:   row.template,
      recipient:  row.recipient,
      body,
      status:     'queued',
      error:      `Sent as a text because WhatsApp failed: ${explain(code)}`,
    }).select().single();

    try {
      const smsSid = await sendSms(row.recipient, body);
      await supabase.from('notifications').update({
        status: 'sent', provider_id: smsSid, sent_at: new Date().toISOString(),
      }).eq('id', smsRow.id);
      return ok('fell back to sms');
    } catch (e) {
      await supabase.from('notifications')
        .update({ status: 'failed', error: String(e) }).eq('id', smsRow.id);
      return ok('sms fallback failed');
    }

  } catch (e) {
    console.log('twilio-status:', String(e));
    return ok('error logged');
  }
});
