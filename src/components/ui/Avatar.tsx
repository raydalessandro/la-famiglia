'use client'

type AvatarProps = {
  emoji?: string | null
  url?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-12 w-12 text-lg',
  lg: 'h-16 w-16 text-2xl',
}

export function Avatar({ emoji, url, name, size = 'md', color = '#E8A838' }: AvatarProps) {
  const classes = `${sizeClasses[size]} rounded-full flex items-center justify-center shrink-0 overflow-hidden`

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0`}
      />
    )
  }

  if (emoji) {
    return (
      <div
        className={classes}
        style={{ backgroundColor: color }}
        aria-label={name}
      >
        <span role="img" aria-hidden="true">{emoji}</span>
      </div>
    )
  }

  return (
    <div
      className={`${classes} font-bold text-white uppercase`}
      style={{ backgroundColor: color }}
      aria-label={name}
    >
      {name.charAt(0)}
    </div>
  )
}
