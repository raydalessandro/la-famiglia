'use client'

type AvatarProps = {
  emoji?: string | null
  url?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  color?: string
  /** When true, draws a coloured ring around the avatar using `color`.
   * This is the per-member identity cue (Cozi-style colour-per-person):
   * apply it on lists where multiple members appear together so each
   * one is recognisable at a glance — chat group rows, member pickers,
   * the chat-room header. Off by default to keep tiny stack avatars
   * (already overlapping with a navy ring) from looking busy. */
  ringed?: boolean
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-12 w-12 text-lg',
  lg: 'h-16 w-16 text-2xl',
  xl: 'h-20 w-20 text-3xl',
}

export function Avatar({
  emoji,
  url,
  name,
  size = 'md',
  color = '#E8A838',
  ringed = false,
}: AvatarProps) {
  const dimensions = sizeClasses[size]
  const ringStyle = ringed
    ? { boxShadow: `0 0 0 2px ${color}, 0 0 0 4px #1a1a2e` }
    : undefined

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${dimensions} rounded-full object-cover shrink-0`}
        style={ringStyle}
      />
    )
  }

  if (emoji) {
    return (
      <div
        className={`${dimensions} rounded-full flex items-center justify-center shrink-0 overflow-hidden`}
        style={{ backgroundColor: color, ...ringStyle }}
        aria-label={name}
      >
        <span role="img" aria-hidden="true">{emoji}</span>
      </div>
    )
  }

  return (
    <div
      className={`${dimensions} rounded-full flex items-center justify-center shrink-0 font-bold text-white uppercase`}
      style={{ backgroundColor: color, ...ringStyle }}
      aria-label={name}
    >
      {name.charAt(0)}
    </div>
  )
}
