'use client'

import type { MemberPublic } from '@/types/database'
import { Avatar } from './Avatar'

type ParticipantPickerProps = {
  members: MemberPublic[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function ParticipantPicker({ members, selected, onChange }: ParticipantPickerProps) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {members.map((member) => {
        const isSelected = selected.includes(member.id)
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => toggle(member.id)}
            className={`flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all ${
              isSelected ? 'bg-[#E8A838]/15' : 'hover:bg-white/5'
            }`}
            aria-pressed={isSelected}
            aria-label={member.name}
          >
            <div
              className={`rounded-full transition-all ${
                isSelected ? 'ring-2 ring-[#E8A838] ring-offset-2 ring-offset-[#1a1a2e]' : ''
              }`}
            >
              <Avatar
                emoji={member.avatar_emoji}
                url={member.avatar_url}
                name={member.name}
                color={member.color}
                size="md"
              />
            </div>
            <span
              className={`text-xs leading-tight text-center truncate w-full ${
                isSelected ? 'text-[#E8A838] font-medium' : 'text-white/70'
              }`}
            >
              {member.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
