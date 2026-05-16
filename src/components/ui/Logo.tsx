'use client'

import React from 'react'

type Props = {
  size?: number
  className?: string
  /** Riservato per future animazioni (spiral-breathe). Per ora no-op:
   *  la classe `animate-spiral-breathe` non e` ancora definita in
   *  tailwind.config / globals.css, quindi inerte. */
  animated?: boolean
}

/**
 * Logo identitario "La Famiglia" — spirale geometrica. Usa
 * `currentColor` come stroke, quindi il colore lo decide chi lo
 * usa (es. `<span class="text-[#E8A838]"><Logo /></span>`).
 */
export function Logo({ size = 32, className = '', animated = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? 'animate-spiral-breathe' : ''} ${className}`.trim()}
      aria-hidden="true"
    >
      <path
        d="M16 16 Q16 14, 14 14 T10 14 Q10 18, 14 18 T22 18 Q22 10, 14 10 T6 10 Q6 22, 18 22 T30 22 Q30 6, 14 6"
        stroke="currentColor"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        opacity={0.85}
      />
    </svg>
  )
}
