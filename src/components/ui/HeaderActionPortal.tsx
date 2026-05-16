'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Slot in cui le pagine renderizzano l'azione principale (es. il "+"
 * per creare un nuovo elemento) che vive nell'header globale a destra.
 *
 * Pattern portal invece di context: la pagina avvolge il proprio
 * bottone in `<HeaderActionPortal>` e il bottone appare nello slot
 * `<div id="header-page-action">` montato dal layout. Zero state,
 * zero rischio loop infinito di re-render, JSX libero senza memoize.
 *
 * Se lo slot non esiste (es. pagine fuori dal layout `(main)`), il
 * componente non renderizza nulla — degrada silenzioso.
 */
export function HeaderActionPortal({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setSlot(document.getElementById('header-page-action'))
  }, [])

  if (!slot) return null
  return createPortal(children, slot)
}
