import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(
  'https://tmsqcxbdawymfvbwomte.supabase.co',
  'sb_publishable_4AZ3jDK_wTmPWPGs4PO9oA_VmIRcYsN',
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
);
