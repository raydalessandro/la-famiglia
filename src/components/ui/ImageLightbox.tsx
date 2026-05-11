'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type ImageLightboxProps = {
  /** Image URLs in display order. */
  images: string[]
  /** Which image is shown when the lightbox opens. */
  initialIndex?: number
  /** Called when the user dismisses (tap-outside, X button, ESC). */
  onClose: () => void
}

/**
 * Full-screen image viewer. Opens centered on `initialIndex`, supports
 * horizontal swipe between images (touch), arrow keys (desktop), tap-X
 * and tap-outside to dismiss. Pinch zoom is deferred — the app viewport
 * disables user scaling, and a robust pinch handler is its own feature.
 * For now the image fits the screen by `object-contain` and the user
 * uses swipe / tap to navigate.
 */
export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const touchStartX = useRef<number | null>(null)
  const SWIPE_THRESHOLD = 60

  const total = images.length
  const safeIndex = Math.max(0, Math.min(index, total - 1))

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(total - 1, i + 1))
  }, [total])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, goPrev, goNext])

  // Lock background scroll while open — without this, swiping the
  // image bleeds into scrolling the page underneath on iOS.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current
    const dx = endX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < SWIPE_THRESHOLD) return
    if (dx > 0) goPrev()
    else goNext()
  }

  if (total === 0) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualizzazione foto"
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Counter (top-left) */}
      {total > 1 && (
        <div className="absolute top-4 left-4 bg-black/50 text-white text-caption font-medium rounded-full px-3 py-1 z-10">
          {safeIndex + 1} / {total}
        </div>
      )}

      {/* Close (top-right) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Chiudi"
        className="absolute top-3 right-3 min-h-touch min-w-touch rounded-full bg-black/50 text-white flex items-center justify-center active:scale-95 transition-transform z-10"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image — stopPropagation on the image area so taps on it don't dismiss. */}
      <img
        src={images[safeIndex]}
        alt=""
        className="max-h-full max-w-full object-contain select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Side arrows for desktop / pointer users. Hidden on tap-only
       * if there's a single image. */}
      {total > 1 && (
        <>
          {safeIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPrev() }}
              aria-label="Foto precedente"
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 min-h-touch min-w-touch rounded-full bg-black/50 text-white items-center justify-center active:scale-95 transition-transform"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {safeIndex < total - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goNext() }}
              aria-label="Foto successiva"
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 min-h-touch min-w-touch rounded-full bg-black/50 text-white items-center justify-center active:scale-95 transition-transform"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  )
}
