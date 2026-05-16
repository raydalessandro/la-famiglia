'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from './Logo'

type HeaderProps = {
  title?: string
  showBack?: boolean
  /** Slot a sinistra (es. menu hamburger). Sovrascritto da back button
   *  se `showBack` e` true. Se null e !showBack → niente a sinistra. */
  leftAction?: React.ReactNode
  /** Slot a destra — di solito popolato dal layout con un placeholder
   *  `<div id="header-page-action">` dentro cui le pagine fanno portal
   *  via `<HeaderActionPortal>`. */
  rightAction?: React.ReactNode
}

/**
 * Header globale del layout `(main)`. Palette navy.
 *
 * Convenzione layout slot:
 *  - left:   hamburger menu (passato dal layout) o back button su pagine secondarie
 *  - center: titolo "La Famiglia"
 *  - right:  slot di pagina (il + del compositore feed/attivita`/ecc.)
 */
export function Header({ title = 'La Famiglia', showBack, leftAction, rightAction }: HeaderProps) {
  const router = useRouter()

  return (
    <header
      className="sticky top-0 z-30 border-b border-white/10 bg-surface/95 backdrop-blur"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="relative flex h-14 items-center px-4">
        <div className="flex">
          {showBack ? (
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
          ) : (
            leftAction
          )}
        </div>

        {/* Centro:
         *  - Default ("La Famiglia"): Logo spirale a sinistra + "La"
         *    bianco + "Famiglia" oro. Identita` brand.
         *  - Override: titolo testo gold (es. "Commenti", "Profilo")
         *    su pagine secondarie con showBack/title custom.
         * absolute al centro geometrico → resta centrato qualunque
         * sia il contenuto di left/right. pointer-events-none lascia
         * passare i tap. */}
        {title === 'La Famiglia' && !showBack ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
            <Logo size={28} className="text-[#E8A838]" />
            <span className="text-lg font-semibold tracking-tight leading-none">
              <span className="text-white">La </span>
              <span className="text-[#E8A838]">Famiglia</span>
            </span>
          </div>
        ) : (
          <h1 className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-base font-bold tracking-wide text-[#E8A838]">
            {title}
          </h1>
        )}

        <div className="ml-auto flex justify-end">{rightAction}</div>
      </div>
    </header>
  )
}
