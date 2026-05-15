'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { AppLauncher } from './AppLauncher'

type HeaderProps = {
  title?: string
  showBack?: boolean
  rightAction?: React.ReactNode
}

/**
 * Header globale del layout `(main)`. Palette Threads-light:
 *  - bg `#FAFAFA/85` + backdrop-blur per leggibilita` durante lo scroll
 *  - hairline 1px `#EAEAEA` come bordo inferiore (no gold soft)
 *  - testo `#0F0F0F` (quasi-nero caldo)
 *  - titolo Inter semibold tracking-tight (no piu` gold serif)
 *
 * Le tre icone azione (settings + admin + notifiche) sono state
 * accorpate in un singolo bottone hamburger che apre un `SideDrawer`,
 * gestito dal caller via `rightAction` — vedi `(main)/layout.tsx`.
 */
export function Header({ title = 'La Famiglia', showBack, rightAction }: HeaderProps) {
  const router = useRouter()

  return (
    <header
      className="sticky top-0 z-30 border-b border-[#EAEAEA] bg-[#FAFAFA]/85 backdrop-blur-xl"
      style={{
        // Header sits below the notch; viewport-fit=cover makes the inset
        // non-zero on iOS PWAs. Padding-top spinge il contenuto sotto la
        // dynamic island / status bar.
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="relative flex h-14 items-center px-4">
        {/* Left zone — back button su pagine secondarie, AppLauncher
         * (4 quadrati → griglia delle app sorelle) su top-level. Mai
         * entrambi: showBack=true vince. */}
        <div className="flex">
          {showBack ? (
            <button
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#0F0F0F] transition-colors hover:bg-black/5"
              aria-label="Indietro"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </button>
          ) : (
            <AppLauncher />
          )}
        </div>

        {/* Titolo — absolute al centro geometrico dell'header così
         * rimane centrato anche quando la zona left contiene il link
         * Music (~80px) invece dello spacer w-10 fisso. `pointer-events-none`
         * lascia passare i tap al link sottostante. */}
        <h1 className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-base font-semibold tracking-tight text-[#0F0F0F]">
          {title}
        </h1>

        {/* Right zone — ml-auto la spinge a destra (il titolo absolute
         * non occupa spazio nel flex). */}
        <div className="ml-auto flex justify-end">{rightAction}</div>
      </div>
    </header>
  )
}
