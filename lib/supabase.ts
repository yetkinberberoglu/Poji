import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const supabase = createClient(
  'https://tmsqcxbdawymfvbwomte.supabase.co',
  'sb_publishable_4AZ3jDK_wTmPWPGs4PO9oA_VmIRcYsN',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      /**
       * On the web this has to be on, and it was off.
       *
       * Confirming an email sends the person back to the site with their
       * session in the URL. With this switched off the client threw that
       * away, so somebody who had just confirmed their email landed on
       * the login form and was asked for the password they had typed two
       * minutes earlier - which is where people give up.
       *
       * It is off on a phone because a native app has no URL to read; the
       * value was presumably copied from a React Native example, where it
       * is right, into a project that is mostly a web app, where it is
       * not.
       */
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);

/**
 * Where an email link should send somebody back to.
 *
 * Taken from the page they are actually on, so a link opened from a
 * localhost sign-up comes back to localhost and one from po-ji.com comes
 * back to po-ji.com. Hard-coding the live site here is what makes
 * confirmation links unusable in development.
 *
 * Whatever this returns must also be listed under Redirect URLs in the
 * Supabase dashboard, or Supabase substitutes the Site URL and ignores it.
 */
export const siteUrl = () =>
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : 'https://po-ji.com';
