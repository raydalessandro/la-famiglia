'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from './Badge'

type BottomNavProps = {
  notificationCount?: number
}

// Icone SVG outline 24px stroke 1.5 inline.
//
// "Famiglia" rimossa dalle tab bottom — spostata nel drawer hamburger
// (vedi `(main)/layout.tsx`). Quello slot e` ora un placeholder "Presto"
// per una nuova feature in arrivo.
const tabs = [
  { href: '/feed', label: 'Bacheca', path: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10', placeholder: false },
  { href: '/activities', label: 'Attività', path: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11', placeholder: false },
  { href: '/calendar', label: 'Agenda', path: 'M3 9h18M8 3v4M16 3v4M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z', placeholder: false },
  { href: '/chat', label: 'Chat', path: 'M21 12a8 8 0 01-11.4 7.3L3 21l1.7-6.6A8 8 0 1121 12z', placeholder: false },
  // Placeholder "coming soon" — slot riservato per una nuova pagina
  // front-only (es. "Memoria / oggi un anno fa"). Disabled, no link.
  { href: '#', label: 'Presto', path: 'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z', placeholder: true },
]

export function BottomNav({ notificationCount = 0 }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-white/10 bg-surface/95 backdrop-blur pb-safe"
      aria-label="Navigazione principale"
    >
      {tabs.map((tab) => {
        const isActive =
          !tab.placeholder && (pathname === tab.href || pathname.startsWith(tab.href + '/'))
        const isChat = tab.href === '/chat'
        const tabContent = (
          <>
            {isActive && (
              <span
                className="absolute top-1.5 h-7 w-12 rounded-full bg-accent-soft -z-0"
                aria-hidden="true"
              />
            )}
            <span className="relative flex h-6 w-6 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={isActive ? 2 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d={tab.path} />
              </svg>
              {isChat && notificationCount > 0 && (
                <Badge count={notificationCount} className="absolute -top-1.5 -right-2.5" />
              )}
            </span>
            <span
              className={`relative text-[11px] leading-none ${
                isActive ? 'font-semibold' : 'font-medium'
              }`}
            >
              {tab.label}
            </span>
          </>
        )

        if (tab.placeholder) {
          return (
            <div
              key={tab.label}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 min-h-touch py-2 text-white/30 cursor-default select-none"
              aria-disabled="true"
              title="Funzione in arrivo"
            >
              {tabContent}
            </div>
          )
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 min-h-touch py-2 transition-colors ${
              isActive ? 'text-accent' : 'text-white/55 hover:text-white/80'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tabContent}
          </Link>
        )
      })}
    </nav>
  )
}
