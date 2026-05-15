'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from './Badge'

type BottomNavProps = {
  notificationCount?: number
}

// Italian labels chosen for clarity over fashion — "Bacheca" reads
// better to grandparents than the English "Feed", and they stay visible
// at all times (Apple HIG: every tab should always show its label).
//
// Icone: stroke-1.5 outline 24px, rese inline come SVG path per
// evitare di trascinare dipendenze icon-set. Le emoji native usate
// precedentemente erano grandi, "social-aggressive" e davano vibe
// template — l'utente l'ha segnalato esplicitamente.
const tabs = [
  { href: '/feed', label: 'Bacheca', path: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10' },
  { href: '/activities', label: 'Attività', path: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11' },
  { href: '/calendar', label: 'Agenda', path: 'M3 9h18M8 3v4M16 3v4M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z' },
  { href: '/chat', label: 'Chat', path: 'M21 12a8 8 0 01-11.4 7.3L3 21l1.7-6.6A8 8 0 1121 12z' },
  { href: '/family', label: 'Famiglia', path: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
]

export function BottomNav({ notificationCount = 0 }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-[#EAEAEA] bg-[#FAFAFA]/95 backdrop-blur-xl pb-safe"
      aria-label="Navigazione principale"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
        const isChat = tab.href === '/chat'

        return (
          <Link
            key={tab.href}
            href={tab.href}
            // No `active:scale-95` — l'utente vuole feedback click senza
            // animazioni geometriche. Lo stato attivo si comunica solo
            // tramite colore (testo + stroke) e peso del label.
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 min-h-touch py-2 transition-colors ${
              isActive ? 'text-[#0F0F0F]' : 'text-[#707070] hover:text-[#0F0F0F]'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
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
          </Link>
        )
      })}
    </nav>
  )
}
