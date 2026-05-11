import Script from 'next/script'

/**
 * On-device JS console for iOS Safari.
 *
 * ▸ Apple does not expose DevTools on iPhone without a paired Mac.
 *   This is the workaround the team uses when a production bug needs
 *   to be diagnosed and no Mac is available.
 *
 * ▸ This component is a **debug tool**, not a product feature. It must
 *   stay invisible to normal users and cost them nothing.
 *
 * Activation
 * ----------
 *  ?debug=1   → loads Eruda from a public CDN and persists the flag
 *               in localStorage so it survives navigations, refreshes,
 *               and the PWA installed on the iOS home screen.
 *  ?debug=0   → clears the flag.
 *  (no flag)  → does absolutely nothing. The CDN is never contacted,
 *               the bundle size is unaffected, no global is created.
 *
 * Why it lives in the root layout
 * -------------------------------
 * The loader runs with `strategy="beforeInteractive"`, which means
 * Next.js inlines it in <head> and the IIFE executes **before** the
 * React bundle hydrates. If the bundle itself crashes during
 * hydration — exactly the kind of bug we'd want to diagnose — Eruda
 * is still up and shows the error. Putting it inside a client
 * component would mean it never loads when we need it most.
 *
 * How the team uses it
 * --------------------
 *  1. User opens https://<domain>/<any-page>?debug=1 on iPhone Safari.
 *  2. A purple ball appears bottom-right. Tap → console + network +
 *     storage + service-worker inspector.
 *  3. The onload hook also logs `[eruda] SW registrations: ...` so we
 *     can immediately tell whether the page is being served by a
 *     stale service worker.
 *  4. When done, `?debug=0` cleans up.
 *
 * If you delete this file
 * -----------------------
 * Also drop the mention in HANDOFF.md (section "Strumenti di debug").
 * Nothing else depends on it.
 */
export function ErudaDevtools() {
  return (
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
                document.body && (document.body.innerHTML += '<div style="position:fixed;bottom:0;left:0;right:0;background:#900;color:#fff;padding:8px;font:12px monospace;z-index:99999">eruda CDN unreachable</div>');
              };
              document.head.appendChild(s);
            } catch (e) {}
          })();
        `,
      }}
    />
  )
}
