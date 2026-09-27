/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(tabs)` | `/(tabs)/bookings` | `/(tabs)/cleaners` | `/(tabs)/home` | `/(tabs)/profile` | `/..\lib\services` | `/_sitemap` | `/admin` | `/auth` | `/booking` | `/bookings` | `/cleaners` | `/client-setup` | `/home` | `/onboarding` | `/profile` | `/provider` | `/review`;
      DynamicRoutes: `/cleaner/${Router.SingleRoutePart<T>}`;
      DynamicRouteTemplate: `/cleaner/[id]`;
    }
  }
}
