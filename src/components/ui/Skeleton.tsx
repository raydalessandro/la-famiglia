'use client'

import React from 'react'

type SkeletonProps = {
  className?: string
  /** Inline style for arbitrary width/height/aspect — handy for image placeholders. */
  style?: React.CSSProperties
}

/** A single shimmering placeholder block. Compose many of these to mock the
 * shape of a card while data is loading. */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={['animate-pulse rounded-md bg-white/5', className].join(' ')}
      style={style}
    />
  )
}

/** Pre-built skeleton for a feed-style card (avatar + 2 lines + image area).
 * Used while the feed loads instead of a generic spinner. */
export function PostCardSkeleton() {
  return (
    <div className="bg-surface-raised rounded-card border border-white/5 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  )
}

/** Pre-built skeleton for a list row (avatar + title + subtitle). Used in the
 * chat list, members list, tasks list. */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 bg-surface-raised rounded-card border border-white/5">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-48" />
      </div>
    </div>
  )
}

/** Pre-built skeleton for an album / photo grid cell. */
export function GridCellSkeleton() {
  return <Skeleton className="aspect-square w-full rounded-xl" />
}
