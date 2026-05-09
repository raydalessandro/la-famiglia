import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'La Famiglia',
  description: 'Il nostro spazio privato',
  manifest: '/manifest.json',
  themeColor: '#E8A838',
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
