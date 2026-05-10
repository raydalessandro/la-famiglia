'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

type HeaderProps = {
  title?: string
  showBack?: boolean
  rightAction?: React.ReactNode
}

export function Header({ title = 'La Famiglia', showBack, rightAction }: HeaderProps) {
  const router = useRouter()

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-surface/95 backdrop-blur px-4"
      style={{
        // Header sits below the notch; viewport-fit=cover makes the inset
        // non-zero on iOS PWAs. Total visible height = 56px (h-14) + inset.
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
      }}
    >
      {/* Left: back button or spacer */}
      <div className="w-10">
        {showBack && (
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Indietro"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Center: title */}
      <h1 className="text-base font-bold tracking-wide text-[#E8A838]">
        {title}
      </h1>

      {/* Right: action */}
      <div className="w-10 flex justify-end">
        {rightAction}
      </div>
    </header>
  )
}
