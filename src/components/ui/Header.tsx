'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

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
         *  - Default ("La Famiglia"): SVG wordmark con icona casa
         *    dorata + "La" bianco + "Famiglia" oro. Identita` brand.
         *  - Override: titolo testo gold (es. "Commenti", "Profilo")
         *    su pagine secondarie con showBack/title custom.
         * absolute al centro geometrico → resta centrato qualunque
         * sia il contenuto di left/right. pointer-events-none lascia
         * passare i tap. */}
        {title === 'La Famiglia' && !showBack ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg
              viewBox="0 0 200 50"
              width="160"
              height="40"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="La Famiglia"
            >
              <path
                d="M10 28 L25 14 L40 28 M15 28 L15 38 L35 38 L35 28"
                stroke="#E8A838"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="25" cy="30" r="2.5" fill="#E8A838" />
              <text
                x="48"
                y="32"
                fontFamily="system-ui, -apple-system, sans-serif"
                fontSize="20"
                fontWeight="600"
                fill="#ffffff"
              >
                La <tspan fill="#E8A838">Famiglia</tspan>
              </text>
            </svg>
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
