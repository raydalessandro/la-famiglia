'use client'

import React from 'react'

type BottomSheetProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-[#1a1a2e] shadow-2xl transition-transform duration-300 ease-out max-h-[90dvh] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/30" />
        </div>

        {/* Title */}
        {title && (
          <div className="px-4 pb-3 shrink-0">
            <h2 className="text-center text-base font-semibold text-white">{title}</h2>
          </div>
        )}

        {/* Scrollable content */}
        <div className="overflow-y-auto overscroll-contain px-4 pb-6">
          {children}
        </div>
      </div>
    </>
  )
}
