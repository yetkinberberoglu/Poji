import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { AppProvider } from '../context/AppContext';
import { supabase } from '../lib/supabase';

async function redirect() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { router.replace('/auth'); return; }

  const { data: profile, error } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();

  if (error) { router.replace('/(tabs)/home'); return; }
  const role = profile?.role;

  if (role === 'admin') { router.replace('/admin'); return; }

  if (role === 'cleaner') {
    const { data: app } = await supabase
      .from('cleaner_profiles').select('verification_status').eq('id', user.id).maybeSingle();
    if (!app || app.verification_status !== 'approved') router.replace('/onboarding');
    else router.replace('/provider');
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
        <Stack.Screen name="client-setup" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="booking" />
        <Stack.Screen name="cleaner/[id]" />
        <Stack.Screen name="provider" />
        <Stack.Screen name="review" />
      </Stack>
    </AppProvider>
  );
}
