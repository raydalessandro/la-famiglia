'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

type HeaderProps = {
  title?: string
  showBack?: boolean
  rightAction?: React.ReactNode
}

// URL pubblico dell'app sorella "Spotimai" (player musicale di famiglia).
// Aperto in nuova tab — non vogliamo che la PWA stacchi dalla schermata
// di home iOS quando ci si naviga.
const SPOTIMAI_URL = 'https://spotimai.vercel.app'

export function Header({ title = 'La Famiglia', showBack, rightAction }: HeaderProps) {
  const router = useRouter()

  return (
    <header
      className="sticky top-0 z-30 border-b border-white/10 bg-surface/95 backdrop-blur"
      style={{
        // Header sits below the notch; viewport-fit=cover makes the inset
        // non-zero on iOS PWAs. Padding-top spinge il contenuto sotto la
        // dynamic island / status bar.
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="relative flex h-14 items-center px-4">
        {/* Left zone — back button su pagine secondarie, link Music su
         * top-level. Mai entrambi: showBack=true vince. */}
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
            <a
              href={SPOTIMAI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Apri Music (Spotimai)"
            >
              {/* Logo Spotimai — spirale verde su sfondo nero, copiato
               * verbatim da Spotimai/public/favicon.svg per coerenza
               * visiva con l'app sorella. Inline per evitare un round-trip
               * di rete e ridurre il flash al primo render. */}
              <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
                <rect width="32" height="32" rx="6" fill="#09090b" />
                <path
                  d="M16 16 Q16 14, 14 14 T10 14 Q10 18, 14 18 T22 18 Q22 10, 14 10 T6 10 Q6 22, 18 22 T30 22 Q30 6, 14 6"
                  stroke="#34d399"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.9"
                />
              </svg>
              <span>Music</span>
            </a>
          )}
        </div>

        {/* Titolo — absolute al centro geometrico dell'header così
         * rimane centrato anche quando la zona left contiene il link
         * Music (~80px) invece dello spacer w-10 fisso. `pointer-events-none`
         * lascia passare i tap al link sottostante. */}
        <h1 className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-base font-bold tracking-wide text-[#E8A838]">
          {title}
        </h1>

        {/* Right zone — ml-auto la spinge a destra (il titolo absolute
         * non occupa spazio nel flex). */}
        <div className="ml-auto flex justify-end">
          {rightAction}
        </div>
      </div>
    </header>
  )
}
