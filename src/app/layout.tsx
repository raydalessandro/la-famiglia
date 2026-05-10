import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'La Famiglia',
  description: 'Il nostro spazio privato',
  manifest: '/manifest.webmanifest',
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
