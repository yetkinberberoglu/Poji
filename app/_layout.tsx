import { usePathname } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { AppProvider } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import InstallPrompt from './install-prompt';

async function redirect() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { router.replace('/auth'); return; }

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

export default function RootLayout() {
  const routerPath = usePathname();
  // usePathname is still '/' on the first frame, which made every deep
  // link look like the front door. The browser knows the truth straight away.
  const steer = () => {
    // Only route people arriving at the front door, or coming back from
    // sign-in. A direct link to a screen should open that screen.
    const path = typeof window !== 'undefined' ? window.location.pathname : routerPath;
    if (!path || path === '/' || path === '/index' || path.startsWith('/auth')) redirect();
  };

  useEffect(() => {
    steer();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) { router.replace('/auth'); return; }
      if (event === 'SIGNED_IN') steer();
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="client-setup" />
        <Stack.Screen name="join" />
        <Stack.Screen name="payout" />
        <Stack.Screen name="my-services" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="admin-trades" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="services" />
        <Stack.Screen name="request" />
        <Stack.Screen name="providers" />
        <Stack.Screen name="booking" />
        <Stack.Screen name="roadside" />
        <Stack.Screen name="cleaner/[id]" />
        <Stack.Screen name="(provider)" />
        <Stack.Screen name="provider" />
        <Stack.Screen name="review" />
        <Stack.Screen name="legal" />
      </Stack>
      <InstallPrompt />
    </AppProvider>
  );
}
