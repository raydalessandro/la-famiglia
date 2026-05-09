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
    <div className="grid grid-cols-8 gap-2">
      {ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-all ${
            value === icon
              ? 'ring-2 ring-[#E8A838] bg-[#E8A838]/20 scale-110'
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
