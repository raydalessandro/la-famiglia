'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from './Badge'

type BottomNavProps = {
  notificationCount?: number
}

const tabs = [
  { href: '/feed', label: 'Feed', emoji: '📰' },
  { href: '/activities', label: 'Attività', emoji: '📋' },
  { href: '/calendar', label: 'Calendario', emoji: '📅' },
  { href: '/chat', label: 'Chat', emoji: '💬' },
  { href: '/family', label: 'Famiglia', emoji: '👨‍👩‍👧‍👦' },
]

export function BottomNav({ notificationCount = 0 }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-white/10 bg-[#1a1a2e] px-2 safe-area-pb">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
        const isChat = tab.href === '/chat'

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
              isActive ? 'text-[#E8A838]' : 'text-white/50 hover:text-white/80'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="relative text-xl leading-none">
              {tab.emoji}
              {isChat && notificationCount > 0 && (
                <Badge
                  count={notificationCount}
                  className="absolute -top-1.5 -right-2.5"
                />
              )}
            </span>
            <span className={`text-[10px] font-medium leading-none ${isActive ? 'text-[#E8A838]' : ''}`}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
