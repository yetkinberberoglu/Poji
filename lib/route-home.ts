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
      .select('verification_status')
      .eq('id', user.id).maybeSingle();

    /* One destination for anyone who has not finished, because the
       wizard is the thing that knows which step is missing — it reads
       that off the data rather than off a stored stage. Splitting the
       decision between here and there is how a provider ended up being
       sent to /join after already completing it: join never advanced
       signup_stage, so this branch kept sending them back to step one.
       signup_stage no longer decides anything. */
    const st = app?.verification_status;
    const unfinished = !app
      || !st
      || ['basic','draft','needs_info','rejected'].includes(st);

    if (unfinished) { router.replace('/provider-setup'); return; }

    /* Submitted, under review or approved: into the app. The Jobs tab
       already says what they can and cannot do yet, and somebody
       waiting on us should not be made to look at a form again on
       every sign-in. */
    router.replace('/(provider)/jobs');
    return;
  }

  // Client — check if they have completed setup
  const { data: cp } = await supabase
    .from('client_profiles').select('onboarding_done').eq('id', user.id).maybeSingle();
  if (!cp || !cp.onboarding_done) { router.replace('/client-setup'); return; }

  router.replace('/(tabs)/home');
}
