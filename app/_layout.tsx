import { usePathname } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { AppProvider } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { routeHome } from '../lib/route-home';
import InstallPrompt from './install-prompt';

export default function RootLayout() {
  const routerPath = usePathname();
  // usePathname is still '/' on the first frame, which made every deep
  // link look like the front door. The browser knows the truth straight away.
  const steer = () => {
    // Only route people arriving at the front door, or coming back from
    // sign-in. A direct link to a screen should open that screen.
    const path = typeof window !== 'undefined' ? window.location.pathname : routerPath;
    if (!path || path === '/' || path === '/index' || path.startsWith('/auth')) routeHome();
  };

  useEffect(() => {
    steer();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      /* Only a real sign-out sends anyone anywhere. This used to fire on any
         event without a session, INITIAL_SESSION included, so every visitor
         who was not signed in got thrown at the login form the moment the
         app booted — whatever page they had actually asked for. */
      if (event === 'SIGNED_OUT') { router.replace('/welcome'); return; }
      if (event === 'SIGNED_IN')  { steer(); }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="client-setup" />
        <Stack.Screen name="join" />
        <Stack.Screen name="payout" />
        <Stack.Screen name="my-services" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="provider-setup" />
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
