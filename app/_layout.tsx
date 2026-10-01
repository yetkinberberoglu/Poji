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
      .from('cleaner_profiles').select('verification_status').eq('id', user.id).maybeSingle();
    // Only push them back into the form when there's nothing submitted yet,
    // or we sent it back for changes. Otherwise the dashboard shows their status.
    const st = app?.verification_status;
    if (!app || st === 'draft' || st === 'rejected') router.replace('/onboarding');
    else router.replace('/(provider)/jobs');
    return;
  }

  // Client — check if they have completed setup
  const { data: cp } = await supabase
    .from('client_profiles').select('onboarding_done').eq('id', user.id).maybeSingle();
  if (!cp || !cp.onboarding_done) { router.replace('/client-setup'); return; }

  router.replace('/(tabs)/home');
}

export default function RootLayout() {
  useEffect(() => {
    redirect();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) { router.replace('/auth'); return; }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') redirect();
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
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="admin" />
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
