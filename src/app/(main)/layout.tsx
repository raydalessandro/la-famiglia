'use client'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { BottomNav, Header, Badge, ToastProvider } from '@/components/ui'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { processQueue } from '@/lib/offline-queue'

function HeaderActions() {
  const { isAdmin } = useAuth()
  const { unreadCount } = useNotifications()

  return (
    <div className="flex items-center gap-3">
      <Link href="/settings" className="text-white/70 hover:text-white transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
      {isAdmin && (
        <Link href="/admin" className="text-[#E8A838] hover:text-[#f0b84d] transition-colors font-medium text-sm">
          Admin
        </Link>
      )}
      <Link href="/feed" className="relative">
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1"><Badge count={unreadCount} /></span>
        )}
      </Link>
    </div>
  )
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Routes that own their own chrome (header + footer) and want the full
  // viewport — the layout's chrome must step out of the way for them.
  const isFullscreenRoute = /^\/chat\/[^/]+$/.test(pathname ?? '')

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login')
  }, [isLoading, isAuthenticated, router])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(() => {})

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PROCESS_OFFLINE_QUEUE') {
        processQueue().catch(() => {})
      }
    }
    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [])

  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-[#E8A838] border-t-transparent rounded-full" />
      </div>
    )
  if (!isAuthenticated) return null

  if (isFullscreenRoute) {
    return <>{children}</>
  }

  return (
    // pb reserves room for BottomNav (min-h-touch=44 + py-2*2=16 + label) plus
    // the iPhone home-bar safe area, so content never hides behind the bar.
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <Header rightAction={<HeaderActions />} />
      <main className="px-4 py-2">{children}</main>
      <BottomNav />
    </div>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGuard>{children}</AuthGuard>
      </ToastProvider>
    </AuthProvider>
  )
}
