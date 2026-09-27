import { supabase } from './supabase';

type Template =
  | 'new_job_offer'
  | 'job_in_pool'
  | 'booking_confirmed'
  | 'cleaner_on_way'
  | 'cleaner_arrived'
  | 'job_finished'
  | 'job_completed'
  | 'application_approved'
  | 'application_rejected';

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
