'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type SideDrawerProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  /** Lato da cui scorre il pannello. Default 'right' (pattern menu utente). */
  side?: 'left' | 'right'
  children: React.ReactNode
}

/**
 * Pannello laterale a slide-from-side.
 *
 * # Portal a document.body — fix bug header backdrop-blur
 *
 * Il pannello e` renderizzato via `createPortal(..., document.body)`
 * e NON come figlio dell'header che lo apre. Motivo: l'header globale
 * usa `backdrop-blur` (filter CSS) che crea un containing block
 * alternativo per i child `position: fixed` su Chrome / Safari.
 * Senza portal, il drawer con `top-0 right-0 bottom-0` veniva
 * ancorato all'header (~60px di altezza) invece che al viewport: il
 * pannello finiva fuori schermo verticalmente e dava l'impressione
 * che le voci del menu NON fossero renderizzate (mentre erano in DOM
 * ma off-canvas).
 *
 * Stesso pattern usato da `AppLauncher` col `BottomSheet` — il bug
 * era documentato lì il 13/05/2026.
 *
 * Larghezza: `min(85vw, 360px)`. 85vw lascia respirare lo scrim su
 * device stretti (telefono nonni 5"); 360px tetto su tablet.
 *
 * Esc + tap fuori chiudono.
 */
export function SideDrawer({ isOpen, onClose, title = 'Menu', side = 'right', children }: SideDrawerProps) {
  // mounted gate per evitare createPortal in SSR (document non esiste).
  // Al primo client render mounted=false → niente portal nell'HTML
  // iniziale. Second-render flippa e il portal entra in DOM, sempre
  // con isOpen=false (stato chiuso).
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!mounted) return null

  const closedTransform = side === 'right' ? 'translate-x-full' : '-translate-x-full'
  const sideClass = side === 'right' ? 'right-0' : 'left-0'

  return createPortal(
    <>
      {/* Scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`fixed top-0 ${sideClass} bottom-0 z-50 flex w-[min(85vw,360px)] flex-col bg-[#1a1a2e] shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : closedTransform
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Chiudi menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </>,
    document.body,
  )
}
