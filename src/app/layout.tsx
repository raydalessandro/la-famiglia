import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'La Famiglia',
  description: 'Il nostro spazio privato',
  manifest: '/manifest.webmanifest',
  // iOS ignores manifest icons when "Add to Home Screen" runs — it picks up
  // <link rel="apple-touch-icon"> explicitly. Without this, iOS falls back
  // to a screenshot of the page, which on a dark app looks like a blob.
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png', sizes: '32x32' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/*
         * Eruda — on-device JS console for iOS Safari.
         *
         * Apple does not expose DevTools on iPhone without a paired Mac, so
         * when the app misbehaves in production (blue screen, frozen fetch,
         * silent JS crash) we have no way to read the error. Eruda fills
         * that gap: it injects a floating button at the bottom-right that
         * opens a Chrome-like devtools panel with console / network /
         * storage / service-worker inspection.
         *
         * Loaded `beforeInteractive` so it runs even if the React bundle
         * crashes during hydration — otherwise we'd never see *that* error.
         *
         * Activation:
         *   ?debug=1   → loads Eruda and persists the flag in localStorage,
         *                so subsequent navigations keep it on.
         *   ?debug=0   → clears the flag and reloads clean.
         *
         * Stays off by default for everyone else, so the CDN is never even
         * contacted in normal usage. Zero perf cost when disabled.
         */}
        <Script
          id="eruda-loader"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var sp = new URLSearchParams(location.search);
                  var override = sp.get('debug');
                  if (override === '0') {
                    try { localStorage.removeItem('__eruda_on__'); } catch (e) {}
                    return;
                  }
                  var persisted = false;
                  try { persisted = localStorage.getItem('__eruda_on__') === '1'; } catch (e) {}
                  var on = override === '1' || persisted;
                  if (!on) return;
                  try { localStorage.setItem('__eruda_on__', '1'); } catch (e) {}
                  var s = document.createElement('script');
                  s.src = 'https://cdn.jsdelivr.net/npm/eruda';
                  s.async = false;
                  s.onload = function() {
                    try {
                      window.eruda.init();
                      // Useful breadcrumb: log SW state at boot so we can
                      // tell whether the page is being served by an old SW.
                      if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.getRegistrations().then(function(rs) {
                          console.log('[eruda] SW registrations:', rs.map(function(r) {
                            return {
                              scope: r.scope,
                              active: r.active && r.active.scriptURL,
                              waiting: r.waiting && r.waiting.scriptURL,
                              installing: r.installing && r.installing.scriptURL,
                            };
                          }));
                        });
                      }
                    } catch (e) {
                      console.error('eruda init failed', e);
                    }
                  };
                  s.onerror = function() {
                    // CDN unreachable. Show something to confirm the loader
                    // ran but couldn't fetch the bundle.
                    document.body && (document.body.innerHTML += '<div style="position:fixed;bottom:0;left:0;right:0;background:#900;color:#fff;padding:8px;font:12px monospace;z-index:99999">eruda CDN unreachable</div>');
                  };
                  document.head.appendChild(s);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-[#1a1a2e] text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
