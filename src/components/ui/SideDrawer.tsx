'use client'

import React, { useEffect } from 'react'

type SideDrawerProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  /** Lato da cui slide il pannello. Default 'right' (pattern menu utente). */
  side?: 'left' | 'right'
  children: React.ReactNode
}

/**
 * Pannello laterale a slide. Pattern simmetrico a `BottomSheet` ma su
 * asse orizzontale: usato per il menu hamburger dell'header globale.
 *
 * Scrim z-40, pannello z-50: stesso layering di `BottomSheet` per
 * comporre senza conflitti (l'AppLauncher su Header apre un
 * BottomSheet, questo apre un SideDrawer — se aperti insieme l'uno
 * non occulta l'altro).
 *
 * Larghezza: `min(85vw, 360px)`. 85vw lascia respirare lo scrim su
 * device stretti (telefono nonni 5"); 360px tetto su tablet così non
 * diventa una "side-bar" desktop fuori contesto.
 *
 * Esc key e tap fuori chiudono — coerente col pattern BottomSheet.
 */
export function SideDrawer({ isOpen, onClose, title = 'Menu', side = 'right', children }: SideDrawerProps) {
  // Chiusura via Esc — micro-affordance accessibility, costa zero.
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const closedTransform = side === 'right' ? 'translate-x-full' : '-translate-x-full'
  const sideClass = side === 'right' ? 'right-0' : 'left-0'

  return (
    <>
      {/* Scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`fixed top-0 ${sideClass} bottom-0 z-50 flex w-[min(85vw,360px)] flex-col bg-[#FAFAFA] shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : closedTransform
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#EAEAEA] px-4">
          <h2 className="text-base font-semibold text-[#0F0F0F]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0F0F0F] transition-colors hover:bg-black/5"
            aria-label="Chiudi menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </>
  )
}
