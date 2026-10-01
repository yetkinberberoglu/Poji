import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Wraps every web page. Expo Router renders this on export,
 * so the PWA tags end up in dist/index.html without a post-build script.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <title>Poji — Home services in Malta</title>
        <meta
          name="description"
          content="Book verified cleaners and tradespeople in Malta. Transparent pricing, pay for the time actually worked."
        />

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4F46E5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Poji" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="shortcut icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />

        {/* Social */}
        <meta property="og:title" content="Poji — Home services in Malta" />
        <meta
          property="og:description"
          content="Book verified cleaners and tradespeople. Pay for the time actually worked."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://po-ji.com" />
        <meta property="og:image" content="https://po-ji.com/icon-512.png" />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: `
          body { background-color: #F8FAFF; }
          @media (prefers-color-scheme: dark) {
            body { background-color: #F8FAFF; }
          }
        `}} />

        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function (e) {
                console.log('SW registration failed:', e);
              });
            });
          }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
