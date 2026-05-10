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
const tabs = [
  { href: '/feed', label: 'Bacheca', emoji: '📰' },
  { href: '/activities', label: 'Attività', emoji: '📋' },
  { href: '/calendar', label: 'Agenda', emoji: '📅' },
  { href: '/chat', label: 'Chat', emoji: '💬' },
  { href: '/family', label: 'Famiglia', emoji: '👨‍👩‍👧‍👦' },
]

export function BottomNav({ notificationCount = 0 }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-white/10 bg-surface/95 backdrop-blur pb-safe"
      aria-label="Navigazione principale"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
        const isChat = tab.href === '/chat'

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 min-h-touch py-2 transition-colors active:scale-95 ${
              isActive ? 'text-accent' : 'text-white/55 hover:text-white/80'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {/* Active indicator pill behind the icon — soft tinted gold so
             * the active state is unmistakable, not just a colour shift. */}
            {isActive && (
              <span
                className="absolute top-1.5 h-7 w-12 rounded-full bg-accent-soft -z-0"
                aria-hidden="true"
              />
            )}
            <span className="relative text-2xl leading-none">
              {tab.emoji}
              {isChat && notificationCount > 0 && (
                <Badge
                  count={notificationCount}
                  className="absolute -top-1.5 -right-2.5"
                />
              )}
            </span>
            <span className="relative text-[12px] font-semibold leading-none">
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
