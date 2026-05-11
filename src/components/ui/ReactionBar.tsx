'use client'

import {
  REACTION_EMOJIS,
  ReactionEmoji,
  PostReactionWithMember,
} from '@/types/database'

type ReactionBarProps = {
  postId: string
  reactions: PostReactionWithMember[]
  currentMemberId: string | undefined
  onToggle: (emoji: ReactionEmoji) => void
}

export function ReactionBar({
  postId: _postId,
  reactions,
  currentMemberId,
  onToggle,
}: ReactionBarProps) {
  return (
    <div className="flex items-center gap-1">
      {REACTION_EMOJIS.map((emoji) => {
        const forEmoji = reactions.filter((r) => r.emoji === emoji)
        const count = forEmoji.length
        const pickedByMe =
          currentMemberId !== undefined &&
          forEmoji.some((r) => r.member_id === currentMemberId)
        const names = forEmoji.map((r) => r.member.name).join(', ')

        const baseLabel = pickedByMe
          ? `Togli ${emoji}`
          : `Reagisci con ${emoji}`
        const label = names ? `${baseLabel} — reagito da ${names}` : baseLabel

        return (
          <button
            key={emoji}
            type="button"
            aria-pressed={pickedByMe}
            aria-label={label}
            onClick={() => onToggle(emoji)}
            className={`min-h-touch min-w-touch px-2.5 rounded-full flex items-center gap-1 transition-colors ${
              pickedByMe
                ? 'bg-accent/20 ring-1 ring-accent/40 text-white'
                : 'hover:bg-white/5 text-white/70'
            }`}
          >
            <span aria-hidden="true" className="text-base leading-none">
              {emoji}
            </span>
            {count > 0 && (
              <span className="text-caption font-medium">{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
