'use client'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { BottomNav, Header, Badge, Logo, SideDrawer, ToastProvider } from '@/components/ui'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { processQueue } from '@/lib/offline-queue'
import { FAMILY_APPS } from '@/lib/family-apps'

/**
 * Bottone hamburger nell'header (zona SINISTRA, era zona destra).
 * Apre il drawer arricchito che ora contiene anche:
 *  - "Famiglia" (link a /family, spostata dal bottom-tab)
 *  - Sezione "Le nostre app" con loghi+nome inline cliccabili
 *    (sostituisce l'AppLauncher button separato)
 *
 * Dot gold sull'hamburger = notifiche non lette (indicator binario).
 */
function HamburgerMenu() {
  const { isAdmin } = useAuth()
  const { unreadCount } = useNotifications()
  const [menuOpen, setMenuOpen] = useState(false)

  const close = () => setMenuOpen(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Apri menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#E8A838]"
            aria-hidden="true"
          />
        )}
      </button>

      <SideDrawer isOpen={menuOpen} onClose={close} side="left" title="Menu">
        <nav className="flex flex-col gap-1 p-3">
          <MenuItem href="/feed" onClick={close} label="Notifiche" badge={unreadCount}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </MenuItem>
          <MenuItem href="/family" onClick={close} label="Famiglia">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
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

        {/* Separator + sezione app sorelle. Mostriamo loghi+nome inline
            (preferenza utente: deve "notarsi che porta a altri mondi"). */}
        <div className="mt-2 border-t border-white/10 pt-3">
          <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Le nostre app
          </p>
          <div className="flex flex-col gap-1 px-3 pb-4">
            {FAMILY_APPS.map((app) => {
              const isLive = app.url !== null
              const content = (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                    <Image
                      src={app.logoSrc}
                      alt=""
                      width={36}
                      height={36}
                      className="h-full w-full object-contain"
                      unoptimized={app.logoSrc.endsWith('.svg')}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-white truncate">{app.name}</span>
                    <span className="block text-[12px] text-white/50 truncate">
                      {isLive ? app.description : 'In arrivo'}
                    </span>
                  </span>
                  {isLive && (
                    <svg
                      className="h-4 w-4 shrink-0 text-white/40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M7 17L17 7M7 7h10v10" />
                    </svg>
                  )}
                </>
              )

              if (!isLive) {
                return (
                  <div
                    key={app.id}
                    className="flex min-h-touch items-center gap-3 rounded-xl px-2 py-2 opacity-50"
                    aria-disabled="true"
                  >
                    {content}
                  </div>
                )
              }

              return (
                <a
                  key={app.id}
                  href={app.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={close}
                  className="flex min-h-touch items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
                  aria-label={`Apri ${app.name} in una nuova tab`}
                >
                  {content}
                </a>
              )
            })}
          </div>
        </div>

        {/* Firma del lab in fondo al drawer. Discreta (white/40),
            spirale piccolina + "powered by EAR LAB" uppercase
            tracking-wider. */}
        <div className="mt-auto flex items-center justify-center gap-2 border-t border-white/5 px-4 py-4 text-white/40">
          <Logo size={16} className="text-white/40" />
          <span className="text-[10px] leading-none">
            <span>powered by </span>
            <span className="font-semibold tracking-wider text-white/60">EAR LAB</span>
          </span>
        </div>
      </SideDrawer>
    </>
  )
}

/**
 * Voce del drawer. Icona 20px stroke 1.5 + label 15px,
 * `min-h-touch` 44px garantito. Accent gold per voci "potere" (Admin).
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
      className={`flex min-h-touch items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/5 ${
        accent ? 'text-[#E8A838]' : 'text-white/90'
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
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {/* Header globale: hamburger a sinistra; il `+` di pagina vive
          dentro lo slot `#header-page-action` a destra, popolato dalle
          pagine via `<HeaderActionPortal>` (vedi src/components/ui/
          HeaderActionPortal.tsx). */}
      <Header
        leftAction={<HamburgerMenu />}
        rightAction={<div id="header-page-action" className="flex items-center" />}
      />
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
