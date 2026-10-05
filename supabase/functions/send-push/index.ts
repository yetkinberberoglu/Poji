// Sends a web push to every device a person has, honouring their settings
// and their quiet hours. Called by send-notification, never by the app.
//
// Deploy:  supabase functions deploy send-push
// Needs:   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  || '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@po-ji.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type':'application/json' } });

/** Which switch governs this kind of message */
const CHANNEL: Record<string, 'jobs' | 'messages' | 'money'> = {
  new_job_offer:'jobs', job_in_pool:'jobs', job_accepted:'jobs',
  cleaner_en_route:'jobs', cleaner_arrived:'jobs', job_started:'jobs',
  job_finished:'jobs', time_proposed:'jobs', time_accepted:'jobs',
  time_declined:'jobs', job_cancelled:'jobs', application_approved:'jobs',
  application_rejected:'jobs',
  new_message:'messages',
  quote_sent:'money', quote_accepted:'money', quote_declined:'money',
  job_completed:'money', payment_released:'money', part_proposed:'money',
  part_approved:'money',
};

/** Short, specific, and it says what to do */
function compose(kind: string, d: any): { title:string; body:string; url:string; urgent?:boolean; tag?:string } {
  const bk = d.bookingId ? `/bookings?id=${d.bookingId}` : '/bookings';
  const job = d.bookingId ? `/(provider)/jobs` : '/(provider)/jobs';

  switch (kind) {
    case 'new_job_offer':
      return { title:'New job for you',
        body: d.model === 'quote'
          ? `${d.address} — they need a price`
          : `${d.address} · ${d.date} at ${d.time}${d.earnings ? ` · €${Number(d.earnings).toFixed(0)}` : ''}`,
        url: job, urgent:true, tag:`offer-${d.bookingId}` };

    case 'job_in_pool':
      return { title:'A job is going spare',
        body:`${d.address} · ${d.date} at ${d.time}. First to accept takes it.`,
        url: job, urgent:true, tag:`pool-${d.bookingId}` };

    case 'job_accepted':
      return { title:`${d.cleanerName || 'Your provider'} accepted`,
        body:`${d.date} at ${d.time}. You'll get a PIN when they arrive.`, url: bk };

    case 'cleaner_en_route':
      return { title:'On the way',
        body:`${d.cleanerName || 'Your provider'} has set off.`, url: bk, urgent:true };

    case 'cleaner_arrived':
      return { title:'They\u2019re at the door',
        body:`Give ${d.cleanerName || 'your provider'} the PIN ${d.pin} to start.`,
        url: bk, urgent:true, tag:`arrived-${d.bookingId}` };

    case 'job_finished':
      return { title:'Work finished',
        body:`${d.cleanerName || 'Your provider'} marked the job done. Have a look and approve it.`,
        url: bk, urgent:true };

    case 'job_completed':
      return { title:'Paid',
        body:`€${Number(d.earnings || 0).toFixed(2)} is on its way to you.`, url:'/(provider)/earnings' };

    case 'new_message':
      return { title: d.fromName || 'New message',
        body: (d.preview || '').slice(0, 90),
        url: d.role === 'cleaner' ? job : bk, tag:`chat-${d.bookingId}` };

    case 'quote_sent':
      return { title:`${d.cleanerName || 'Your provider'} has quoted`,
        body:`€${d.amount} all in. Accept or decline before anyone travels.`,
        url: bk, urgent:true };

    case 'quote_accepted':
      return { title:'Quote accepted', body:`€${d.amount} · ${d.date} at ${d.time}`, url: job };

    case 'quote_declined':
      return { title:'Quote declined', body:`${d.address} — the job is cancelled.`, url: job };

    case 'time_proposed':
      return { title:`${d.cleanerName || 'Your provider'} suggests another time`,
        body:`${d.newDate} at ${d.newTime} instead of ${d.oldDate} at ${d.oldTime}.`,
        url: bk, urgent:true };

    case 'time_accepted':
      return { title:'New time confirmed', body:`${d.date} at ${d.time} · ${d.address}`, url: job };

    case 'time_declined':
      return { title:'That time didn\u2019t work',
        body:`${d.address} has gone back to the pool.`, url: job };

    case 'job_cancelled':
      return { title:'Job cancelled',
        body:`${d.address}${d.reason ? ` — ${d.reason}` : ''}`, url: bk };

    case 'part_proposed':
      return { title:'A part needs your approval',
        body:`${d.partName} · €${d.amount}. Nothing is charged until you agree.`,
        url: bk, urgent:true };

    case 'part_approved':
      return { title:'Part approved', body:`${d.partName} · €${d.amount}`, url: job };

    case 'application_approved':
      return { title:'You\u2019re verified',
        body:'Your profile is live. Clients can book you now.', url:'/(provider)/jobs' };

    case 'application_rejected':
      return { title:'We need a few changes',
        body: d.reason || 'Open Poji to see what to fix.', url:'/onboarding' };

    default:
      return { title:'Poji', body:'Something needs your attention.', url:'/' };
  }
}

/** Nobody wants a job alert at three in the morning */
function inQuietHours(from?: string | null, to?: string | null): boolean {
  if (!from || !to) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const start = fh * 60 + fm, end = th * 60 + tm;
  return start <= end ? (mins >= start && mins < end) : (mins >= start || mins < end);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return reply({ ok:false, error:'Push is not configured' }, 501);
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const { userId, kind, data } = await req.json();
    if (!userId || !kind) return reply({ ok:false, error:'userId and kind are required' }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: person } = await supabase
      .from('profiles')
      .select('push_enabled, push_jobs, push_messages, push_money, quiet_from, quiet_to')
      .eq('id', userId).maybeSingle();

    if (person?.push_enabled === false) return reply({ ok:true, skipped:'off' });

    const channel = CHANNEL[kind] || 'jobs';
    if (channel === 'jobs'     && person?.push_jobs === false)     return reply({ ok:true, skipped:'jobs off' });
    if (channel === 'messages' && person?.push_messages === false) return reply({ ok:true, skipped:'messages off' });
    if (channel === 'money'    && person?.push_money === false)    return reply({ ok:true, skipped:'money off' });

    const note = compose(kind, data || {});

    // Quiet hours hold back everything except someone at the door
    if (inQuietHours(person?.quiet_from, person?.quiet_to) && kind !== 'cleaner_arrived') {
      return reply({ ok:true, skipped:'quiet hours' });
    }

    const { data: tokens } = await supabase
      .from('push_tokens').select('id, token').eq('user_id', userId);

    if (!tokens?.length) return reply({ ok:true, skipped:'no devices' });

    let sent = 0;
    const dead: string[] = [];

    for (const t of tokens) {
      try {
        await webpush.sendNotification(JSON.parse(t.token), JSON.stringify(note));
        sent++;
      } catch (e: any) {
        // 404 and 410 mean the browser threw the subscription away
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(t.id);
        else console.error('push failed', e?.statusCode, e?.body);
      }
    }

    if (dead.length) await supabase.from('push_tokens').delete().in('id', dead);

    return reply({ ok:true, sent, removed: dead.length });

  } catch (e) {
    console.error(e);
    return reply({ ok:false, error: String(e) }, 500);
  }
});
