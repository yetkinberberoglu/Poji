import { router } from 'expo-router';
import { supabase } from './supabase';

/**
 * Where a signed-in person belongs, and what to do when nobody is signed in.
 *
 * This used to live inside the root layout, which meant the welcome screen
 * had no way to ask the same question — someone who opened /welcome while
 * already signed in sat there looking at a pitch for a product they were
 * already using.
 */
export async function routeHome() {
  const { data: { user } } = await supabase.auth.getUser();

  /* Not signed in: the front door is an explanation, not a login form.
     Somebody who has never heard of Poji cannot decide whether to make an
     account from a password field. */
  if (!user) { router.replace('/welcome'); return; }

  // Email has to be confirmed before anything else
  if (!user.email_confirmed_at) { router.replace('/verify-email'); return; }

  const { data: profile, error } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();

  if (error) { router.replace('/(tabs)/home'); return; }
  const role = profile?.role;

  if (role === 'admin') { router.replace('/admin'); return; }

  if (role === 'cleaner') {
    const { data: app } = await supabase
      .from('cleaner_profiles')
      .select('signup_stage, verification_status')
      .eq('id', user.id).maybeSingle();

    // Nothing started — the short version first
    if (!app || !app.signup_stage) { router.replace('/join'); return; }

    // Sent back for changes
    if (app.verification_status === 'rejected') { router.replace('/onboarding'); return; }

    // Everyone else lands in the app. What they can do there depends on
    // how far through they are — the Jobs tab handles that.
    router.replace('/(provider)/jobs');
    return;
  }

  // Client — check if they have completed setup
  const { data: cp } = await supabase
    .from('client_profiles').select('onboarding_done').eq('id', user.id).maybeSingle();
  if (!cp || !cp.onboarding_done) { router.replace('/client-setup'); return; }

  router.replace('/(tabs)/home');
}
