'use client'

type BadgeProps = {
  count: number
  className?: string
}

export function Badge({ count, className = '' }: BadgeProps) {
  if (count <= 0) return null

  return (
    <span
      className={`inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold leading-none ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
