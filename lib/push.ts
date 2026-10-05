import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Expo's push service, reached through the web APIs so it works in the
 * PWA today and keeps working when this is wrapped as a native app.
 *
 * Nothing here throws at the caller — a person who refuses notifications
 * should still be able to use the app.
 */

const VAPID_PUBLIC = process.env.EXPO_PUBLIC_VAPID_KEY || '';

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export function pushState(): PushState {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as PushState;
}

/** Browsers hand us a key as base64url; the subscribe call wants bytes */
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/**
 * Ask once, store the result. Returns true when we can now reach this device.
 */
export async function enablePush(): Promise<boolean> {
  if (pushState() === 'unsupported') return false;

  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (!VAPID_PUBLIC) {
        console.log('push: no VAPID key configured');
        return false;
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    await supabase.from('push_tokens').upsert({
      user_id: user.id,
      token: JSON.stringify(sub),
      platform: 'web',
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'token' });

    return true;
  } catch (e) {
    console.log('push: could not enable', e);
    return false;
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_tokens').delete().eq('token', JSON.stringify(sub));
      await sub.unsubscribe();
    }
  } catch (e) {
    console.log('push: could not disable', e);
  }
}

/** Keep the record fresh so we don't push at devices that went away */
export async function touchPush() {
  if (pushState() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('push_tokens').upsert({
      user_id: user.id,
      token: JSON.stringify(sub),
      platform: 'web',
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'token' });
  } catch {}
}
