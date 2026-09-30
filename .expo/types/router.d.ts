/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(tabs)` | `/(tabs)/bookings` | `/(tabs)/cleaners` | `/(tabs)/home` | `/(tabs)/profile` | `/..\constants\trades` | `/_sitemap` | `/admin` | `/auth` | `/booking` | `/bookings` | `/cleaners` | `/client-setup` | `/home` | `/install-prompt` | `/onboarding` | `/profile` | `/provider` | `/providers` | `/review` | `/roadside` | `/services`;
      DynamicRoutes: `/cleaner/${Router.SingleRoutePart<T>}`;
      DynamicRouteTemplate: `/cleaner/[id]`;
    }
  }
}
