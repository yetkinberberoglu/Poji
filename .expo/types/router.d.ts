/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(provider)\_layout` | `/(provider)\earnings` | `/(provider)\jobs` | `/(provider)\profile` | `/(tabs)` | `/(tabs)/bookings` | `/(tabs)/cleaners` | `/(tabs)/home` | `/(tabs)/profile` | `/..\components\Avatar` | `/..\components\Logo` | `/..\components\PartsPanel` | `/..\components\PhoneVerify` | `/..\components\Picker` | `/..\components\ProposeTime` | `/..\supabase\functions\verify-phone\` | `/_sitemap` | `/admin` | `/auth` | `/booking` | `/bookings` | `/cleaners` | `/client-setup` | `/home` | `/install-prompt` | `/legal` | `/onboarding` | `/profile` | `/provider` | `/providers` | `/request` | `/review` | `/roadside` | `/services` | `/verify-email`;
      DynamicRoutes: `/cleaner/${Router.SingleRoutePart<T>}`;
      DynamicRouteTemplate: `/cleaner/[id]`;
    }
  }
}
