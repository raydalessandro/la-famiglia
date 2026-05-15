'use client'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { BottomNav, Header, Badge, SideDrawer, ToastProvider } from '@/components/ui'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { processQueue } from '@/lib/offline-queue'

/**
 * Hamburger button + SideDrawer. Sostituisce le 3 icone separate
 * (settings + admin + notifiche) che cluttavano il lato destro
 * dell'header. Il drawer contiene le stesse destinazioni come MenuItem
 * con icona thin-stroke 1.5 e label leggibile.
 *
 * Un piccolo dot purple `#5856D6` sull'hamburger funge da "ci sono
 * notifiche non lette": non un Badge full coi numeri (rumoroso) ma
 * indicator binario — il count vero vive accanto a "Notifiche" dentro
 * il drawer.
 */
function HeaderActions() {
  const { isAdmin } = useAuth()
  const { unreadCount } = useNotifications()
  const [menuOpen, setMenuOpen] = useState(false)

  const close = () => setMenuOpen(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#0F0F0F] transition-colors hover:bg-black/5"
        aria-label="Apri menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#5856D6]"
            aria-hidden="true"
          />
        )}
      </button>

      <SideDrawer isOpen={menuOpen} onClose={close} title="Menu">
        <nav className="flex flex-col gap-1 p-3">
          <MenuItem href="/feed" onClick={close} label="Notifiche" badge={unreadCount}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </MenuItem>
          <MenuItem href="/settings" onClick={close} label="Impostazioni">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </MenuItem>
          {isAdmin && (
            <MenuItem href="/admin" onClick={close} label="Amministrazione" accent>
              <path d="M12 2L4 6v6c0 5 3.5 9.4 8 10 4.5-.6 8-5 8-10V6l-8-4z" />
            </MenuItem>
          )}
        </nav>
      </SideDrawer>
    </>
  )
}

/**
 * Singola voce del drawer. Icona 20px stroke 1.5 + label 15px.
 * Tap target garantito da `min-h-touch` (44px) + padding.
 *
 * `accent=true` segna le voci "potere" (Admin) con il viola del tema
 * — coerente con l'accent dell'attuale palette light.
 */
function MenuItem({
  href,
  onClick,
  label,
  badge,
  accent,
  children,
}: {
  href: string
  onClick: () => void
  label: string
  badge?: number
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex min-h-touch items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-black/5 ${
        accent ? 'text-[#5856D6]' : 'text-[#0F0F0F]'
      }`}
    >
      <svg
        className="h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      {badge !== undefined && badge > 0 && <Badge count={badge} />}
    </Link>
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5856D6] border-t-transparent" />
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
