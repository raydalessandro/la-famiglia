'use client'

import React from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'destructive'
type ButtonSize = 'md' | 'sm'

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner inside the button and disables it. The button keeps its
   * width so the layout doesn't jump. */
  loading?: boolean
  /** Make the button take the full width of its container. */
  fullWidth?: boolean
  /** Optional icon rendered before the label (16px box). */
  leftIcon?: React.ReactNode
  /** Optional icon rendered after the label (16px box). */
  rightIcon?: React.ReactNode
  children: React.ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-surface hover:bg-accent-hover active:scale-95 ' +
    'disabled:opacity-40 disabled:active:scale-100 font-bold',
  ghost:
    'bg-white/5 text-white hover:bg-white/10 active:scale-95 ' +
    'disabled:opacity-40 disabled:active:scale-100 font-medium',
  destructive:
    'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 ' +
    'active:scale-95 disabled:opacity-40 disabled:active:scale-100 font-medium',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  // 48px tall — Apple HIG accessible target. Text is 17px (body) for readability.
  md: 'h-12 px-5 text-body rounded-xl gap-2',
  // 44px tall — still above the 44px floor. Use only for inline/secondary actions.
  sm: 'h-touch px-4 text-[15px] rounded-lg gap-1.5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading
  const widthClass = fullWidth ? 'w-full' : ''

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        widthClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading ? (
        <span
          className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  )
}
