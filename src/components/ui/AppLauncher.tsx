'use client'

import { useState } from 'react'
import Image from 'next/image'
import { BottomSheet } from './BottomSheet'
import { FAMILY_APPS, FamilyApp } from '@/lib/family-apps'

/**
 * Icona launcher nell'header che apre un bottom sheet con la griglia
 * delle app sorelle dell'ecosistema (Music, Cucina in Famiglia, ecc.).
 *
 * Scelta dell'icona: 4 quadrati arrotondati 2×2, pattern app-launcher
 * universale (iOS Control Center, macOS Launchpad, Google Workspace
 * switcher). Più riconoscibile dei "9 puntini" per audience non tech.
 *
 * Il registry delle app vive in `src/lib/family-apps.ts`. Aggiungere
 * una nuova app è una entry in quel file + un logo in `public/apps/`.
 */
export function AppLauncher() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-[#E8A838]/80 transition-colors hover:bg-white/10 hover:text-[#E8A838] active:bg-white/15"
        aria-label="Apri le altre app di famiglia"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      </button>

      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Le nostre app"
      >
        <div className="grid grid-cols-2 gap-3 pt-2">
          {FAMILY_APPS.map((app) => (
            <AppCard key={app.id} app={app} onOpen={() => setOpen(false)} />
          ))}
        </div>
      </BottomSheet>
    </>
  )
}

function AppCard({ app, onOpen }: { app: FamilyApp; onOpen: () => void }) {
  const isLive = app.url !== null

  const cardClass = `flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all ${
    isLive
      ? 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10 active:scale-[0.98]'
      : 'border-white/5 bg-white/[0.02] opacity-60'
  }`

  // Glow tinto con l'accent del logo, lieve, dietro all'immagine.
  const logoWrapStyle = app.accent
    ? { boxShadow: `0 0 0 1px ${app.accent}33 inset` }
    : undefined

  const inner = (
    <>
      <div
        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-white/5"
        style={logoWrapStyle}
      >
        <Image
          src={app.logoSrc}
          alt={app.name}
          width={64}
          height={64}
          className="h-full w-full object-contain"
          // I logo sono piccoli e statici, niente lazy-load: appaiono
          // tutti insieme quando l'utente apre il launcher.
          priority={false}
          unoptimized={app.logoSrc.endsWith('.svg')}
        />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-white">{app.name}</p>
        <p className="mt-0.5 text-xs text-white/50">
          {isLive ? app.description : 'In arrivo'}
        </p>
      </div>
    </>
  )

  if (!isLive) {
    return (
      <div className={cardClass} aria-disabled="true" role="group" aria-label={`${app.name} — in arrivo`}>
        {inner}
      </div>
    )
  }

  return (
    <a
      href={app.url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className={cardClass}
      aria-label={`Apri ${app.name} in una nuova tab`}
    >
      {inner}
    </a>
  )
}
