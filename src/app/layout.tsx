import type { Metadata, Viewport } from 'next'
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
      <body className={`${inter.className} bg-[#1a1a2e] text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
