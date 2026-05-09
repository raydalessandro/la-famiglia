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
    <div className="flex flex-wrap gap-3">
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`h-8 w-8 rounded-full transition-all ${
            value === color
              ? 'ring-2 ring-offset-2 ring-offset-[#1a1a2e] ring-white scale-110'
              : 'hover:scale-105'
          }`}
          style={{ backgroundColor: color }}
          aria-label={color}
          aria-pressed={value === color}
        />
      ))}
    </div>
  )
}
