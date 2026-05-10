'use client'

const COLORS = [
  '#E8A838',
  '#4FC3F7',
  '#E85D75',
  '#66BB6A',
  '#AB47BC',
  '#FF7043',
  '#26C6DA',
  '#9CCC65',
]

type ColorPickerProps = {
  value: string
  onChange: (v: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {COLORS.map((color) => (
        // 44px tappable square with a 32px coloured circle inside.
        // The big tappable surface is essential for older users —
        // a bare 32px target was below the iOS HIG accessible floor.
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className="h-touch w-touch rounded-full flex items-center justify-center transition-all active:scale-90"
          aria-label={color}
          aria-pressed={value === color}
        >
          <span
            className={`block h-8 w-8 rounded-full transition-all ${
              value === color
                ? 'ring-2 ring-offset-2 ring-offset-surface ring-white scale-110'
                : ''
            }`}
            style={{ backgroundColor: color }}
          />
        </button>
      ))}
    </div>
  )
}
