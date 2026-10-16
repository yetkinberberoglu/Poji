import { supabase } from './supabase';

type Template =
  | 'new_job_offer'
  /* job_in_pool is gone with the pool. A job was never taken out of
     one, and anyone who had taken one would have worked at a price the
     client agreed with somebody else. */
  | 'pick_again'
  | 'booking_confirmed'
  | 'cleaner_on_way'
  | 'cleaner_arrived'
  | 'job_finished'
  /* An hourly job that ran more than thirty billed minutes past its
     estimate. Same six-hour window as job_finished, but the client is
     told what it now costs instead of only being asked to confirm. */
  | 'job_overrun'
  | 'job_completed'
  | 'application_approved'
  | 'application_rejected'
  | 'new_message'
  | 'time_proposed'
  | 'time_accepted'
  | 'time_declined'
  | 'no_show_recorded'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_declined'
  | 'quote_countered'
  | 'counter_accepted'
  | 'counter_declined'
  | 'all_quotes_declined';

/**
 * Fire-and-forget notification. Never blocks the UI —
 * if the function is not deployed yet, it fails silently.
 */
export async function notify(
  userId: string,
  template: Template,
  data: Record<string, any> = {},
  bookingId?: string
) {
  if (!userId) return;
  try {
    const { error } = await supabase.functions.invoke('send-notification', {
      body: { userId, bookingId, template, data },
    });
    if (error) console.log('notify error:', error.message);
  } catch (e) {
    console.log('notify failed:', e);
  }
}
