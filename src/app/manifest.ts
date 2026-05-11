import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'La Famiglia',
    short_name: 'Famiglia',
    description: 'Il nostro spazio privato',
    start_url: '/feed',
    display: 'standalone',
    background_color: '#1a1a2e',
    // Was '#E8A838' (gold) — out of sync with the layout's <meta theme-color>
    // which is navy. The whole app surface is navy, so the splash/status bar
    // must match or you get a gold flash on launch and a white-edge halo
    // around the icon on Android.
    theme_color: '#1a1a2e',
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable icon: Android crops to a circle/squircle, so the file has a
      // 12% safe-zone padding around the tree.
      { src: '/icons/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
