'use client'

const ICONS = [
  '📅', '⚽', '🏊', '💃', '🎵', '🎨',
  '📚', '🏥', '🛒', '🍕', '🎂', '🎄',
  '✈️', '🚗', '🏠', '❤️',
]

type IconPickerProps = {
  value: string
  onChange: (v: string) => void
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    // 6 columns at 44px each fits comfortably on a 360px-wide phone with
    // gaps; older users get a tappable target above the iOS HIG floor.
    <div className="grid grid-cols-6 gap-2">
      {ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={`flex h-touch w-full items-center justify-center rounded-xl text-2xl transition-all ${
            value === icon
              ? 'ring-2 ring-accent bg-accent-soft scale-105'
              : 'hover:bg-white/10'
          }`}
          aria-label={icon}
          aria-pressed={value === icon}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}
