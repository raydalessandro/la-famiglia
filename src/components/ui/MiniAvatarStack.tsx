'use client'

import type { MemberPublic } from '@/types/database'
import { Avatar } from './Avatar'

type MiniAvatarStackProps = {
  members: MemberPublic[]
  max?: number
}

export function MiniAvatarStack({ members, max = 3 }: MiniAvatarStackProps) {
  const visible = members.slice(0, max)
  const overflow = members.length - max

  return (
    <div className="flex items-center">
      {visible.map((member, index) => (
        <div
          key={member.id}
          className="rounded-full ring-2 ring-[#1a1a2e]"
          style={{ marginLeft: index === 0 ? 0 : '-8px', zIndex: visible.length - index }}
        >
          <Avatar
            emoji={member.avatar_emoji}
            url={member.avatar_url}
            name={member.name}
            color={member.color}
            size="sm"
          />
        </div>
      ))}

      {overflow > 0 && (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 ring-2 ring-[#1a1a2e] text-xs font-bold text-white shrink-0"
          style={{ marginLeft: '-8px', zIndex: 0 }}
          aria-label={`${overflow} altri`}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
