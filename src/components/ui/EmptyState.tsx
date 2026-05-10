'use client'

import React from 'react'

type EmptyStateProps = {
  /** Big icon shown above the title. Pass an emoji string (most common) or a
   * full React node if you need an SVG. */
  icon?: React.ReactNode
  /** Short, declarative title in plain Italian — "Ancora nessuna ricetta",
   * not "Nessun dato disponibile". */
  title: string
  /** One line of subtitle that invites the user to act. Optional but
   * strongly recommended (NN/G: every empty state should suggest the
   * next step). */
  description?: string
  /** Primary call-to-action. Pass a <Button> or any clickable node — kept
   * generic so the parent can wire the right handler. */
  action?: React.ReactNode
  className?: string
}

/**
 * EmptyState — single source of truth for "this list is empty" screens
 * across the app. Replaces the half-dozen ad-hoc inline variants the
 * audit found (different paddings, font sizes, missing CTAs).
 *
 * Per NN/G "Empty State Interface Design": one icon, one declarative
 * title, one inviting subtitle, one CTA. No more, no less.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center py-16 px-6 text-center gap-3',
        className,
      ].join(' ')}
    >
      {icon && (
        <div className="text-6xl mb-1" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-white font-semibold text-[18px]">{title}</p>
      {description && (
        <p className="text-white/55 text-body max-w-xs">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
