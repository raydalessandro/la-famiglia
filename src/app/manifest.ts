import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'La Famiglia',
    short_name: 'Famiglia',
    description: 'Il nostro spazio privato',
    start_url: '/feed',
    display: 'standalone',
    background_color: '#1a1a2e',
    theme_color: '#E8A838',
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
