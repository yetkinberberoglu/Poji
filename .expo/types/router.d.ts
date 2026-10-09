/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(provider)` | `/(provider)/earnings` | `/(provider)/jobs` | `/(provider)/profile` | `/(provider)/schedule` | `/(provider)\jobs` | `/(tabs)` | `/(tabs)/bookings` | `/(tabs)/cleaners` | `/(tabs)/home` | `/(tabs)/profile` | `/..\components\QuotePanel` | `/..\lib\services` | `/_sitemap` | `/admin` | `/auth` | `/booking` | `/bookings` | `/cleaners` | `/client-setup` | `/earnings` | `/home` | `/install-prompt` | `/jobs` | `/join` | `/legal` | `/my-services` | `/onboarding` | `/payout` | `/profile` | `/provider` | `/providers` | `/request` | `/review` | `/roadside` | `/schedule` | `/services` | `/verify-email`;
      DynamicRoutes: `/cleaner/${Router.SingleRoutePart<T>}`;
      DynamicRouteTemplate: `/cleaner/[id]`;
    }
  }
}
