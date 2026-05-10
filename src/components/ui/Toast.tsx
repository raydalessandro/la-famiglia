'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

type ToastTone = 'success' | 'error' | 'info'

type Toast = {
  id: string
  message: string
  tone: ToastTone
}

type ToastContextValue = {
  show: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION_MS = 4000

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200',
  error: 'bg-red-500/15 border-red-500/30 text-red-200',
  info: 'bg-surface-raised border-accent-ring text-white',
}

const TONE_ICONS: Record<ToastTone, string> = {
  success: '✓',
  error: '⚠',
  info: 'ℹ',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, message, tone }])
  }, [])

  const value: ToastContextValue = {
    show,
    success: useCallback((m: string) => show(m, 'success'), [show]),
    error: useCallback((m: string) => show(m, 'error'), [show]),
    info: useCallback((m: string) => show(m, 'info'), [show]),
  }

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Stack pinned above the BottomNav (h-16 = 64px) with safe-area padding. */}
      <div
        className="fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 pb-safe pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, DEFAULT_DURATION_MS)
    return () => window.clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      role="status"
      onClick={onDismiss}
      className={[
        'pointer-events-auto cursor-pointer max-w-sm w-full',
        'rounded-xl border px-4 py-3 backdrop-blur',
        'flex items-center gap-3 shadow-lg shadow-black/30',
        'animate-[fadeInUp_180ms_ease-out]',
        TONE_STYLES[toast.tone],
      ].join(' ')}
    >
      <span className="text-base shrink-0" aria-hidden="true">
        {TONE_ICONS[toast.tone]}
      </span>
      <p className="text-[15px] flex-1">{toast.message}</p>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used inside a <ToastProvider>')
  }
  return ctx
}
