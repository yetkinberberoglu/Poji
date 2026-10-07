import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Photos in a conversation.
 *
 * On the web — which is where Poji runs today — the browser's own file picker
 * gives a phone both the camera and the photo library, so there is nothing to
 * install. A picture off a modern phone is three or four megabytes, which is
 * slow on mobile data and pointless at that size in a chat bubble, so
 * everything is resized and re-encoded before it leaves the device.
 */

export const MAX_EDGE   = 1600;   // px on the longest side
export const JPEG_Q     = 0.82;
export const MAX_UPLOAD = 8 * 1024 * 1024;

export type Picked = { blob: Blob; width: number; height: number };

/** True when this device can offer a picture at all */
export const canSendPhotos = () =>
  Platform.OS === 'web' && typeof document !== 'undefined';

/**
 * Ask for a picture. Resolves with null if they change their mind.
 * On a phone the browser offers the camera and the library; on a desktop
 * it is the ordinary file dialog.
 */
export function pickPhoto(): Promise<Picked | null> {
  if (!canSendPhotos()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const done = (v: Picked | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };

    // a cancelled dialog fires nothing on most browsers, so clean up on focus
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => { if (!input.files?.length) done(null); }, 400);
    };
    window.addEventListener('focus', onFocus);

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      try {
        done(await shrink(file));
      } catch (e) {
        console.log('photo: could not read that file', e);
        done(null);
      }
    };

    input.click();
  });
}

/** Resize to something sensible and re-encode as JPEG */
async function shrink(file: File): Promise<Picked> {
  // from-image applies the EXIF rotation, so photos aren't sideways
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any)
    .catch(() => createImageBitmap(file));

  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/jpeg', JPEG_Q)
  );

  return { blob, width: w, height: h };
}

/** Put it in the bucket under the booking it belongs to */
export async function uploadChatPhoto(bookingId: string, picked: Picked) {
  if (picked.blob.size > MAX_UPLOAD) {
    throw new Error('That picture is too large — try a smaller one.');
  }

  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const path = `${bookingId}/${name}`;

  const { error } = await supabase.storage
    .from('chat-photos')
    .upload(path, picked.blob, { contentType: 'image/jpeg', upsert: false });

  if (error) throw new Error(error.message);
  return path;
}

/**
 * The bucket is private, so every picture needs a short-lived signed link.
 * They are cached for the session — a signed URL is cheap but not free.
 */
const urlCache = new Map<string, { url: string; until: number }>();

export async function photoUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;

  const { data, error } = await supabase.storage
    .from('chat-photos').createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    console.log('photo: no signed url', error?.message);
    return null;
  }

  urlCache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** Signed links for a whole conversation at once */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const need = paths.filter(p => {
    const hit = urlCache.get(p);
    return !hit || hit.until <= Date.now();
  });

  if (need.length) {
    const { data } = await supabase.storage
      .from('chat-photos').createSignedUrls(need, 3600);
    (data || []).forEach((row: any) => {
      if (row.signedUrl && row.path) {
        urlCache.set(row.path, {
          url: row.signedUrl, until: Date.now() + 50 * 60 * 1000,
        });
      }
    });
  }

  const out: Record<string, string> = {};
  paths.forEach(p => {
    const hit = urlCache.get(p);
    if (hit) out[p] = hit.url;
  });
  return out;
}
