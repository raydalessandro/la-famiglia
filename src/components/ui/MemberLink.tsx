'use client'

import Link from 'next/link'
import React from 'react'

/**
 * Click-to-profile wrapper. Use it around any avatar+name pair that
 * identifies a family member — the navy app shell has a "Famiglia"
 * profile page at /family/[id] and this is the single shortcut from
 * anywhere else.
 *
 * Kept deliberately thin (a `<Link>` with a default scale tap-feedback)
 * so nested clickable areas (e.g. a delete button in a post header)
 * keep working — Link only handles the outermost surface.
 */
export function MemberLink({
  memberId,
  children,
  className = '',
  ariaLabel,
}: {
  memberId: string
  children: React.ReactNode
  className?: string
  ariaLabel?: string
}) {
  return (
    <Link
      href={`/family/${memberId}`}
      aria-label={ariaLabel}
      className={`active:scale-95 transition-transform ${className}`}
    >
      {children}
    </Link>
  )
}
