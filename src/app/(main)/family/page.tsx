'use client'

import Link from 'next/link'
import { useMembers } from '@/hooks/useMembers'
import { useAuth } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui'

export default function FamilyPage() {
  const { members, isLoading } = useMembers()
  const { member: me } = useAuth()

  const activeMembers = members.filter((m) => m.is_active)

  return (
    <div className="min-h-dvh bg-[#1a1a2e] text-white">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#1a1a2e] px-4 py-4">
        <h1 className="text-xl font-bold text-[#E8A838]">La Famiglia</h1>
        <p className="text-sm text-white/50 mt-0.5">
          {activeMembers.length} {activeMembers.length === 1 ? 'membro' : 'membri'}
        </p>
      </div>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : activeMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-5xl">👨‍👩‍👧‍👦</span>
            <p className="text-white/40 text-sm">Nessun membro trovato</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {activeMembers.map((m) => (
              <Link
                key={m.id}
                href={`/family/${m.id}`}
                className="group relative flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-5 transition-all active:scale-95 hover:bg-white/10"
              >
                {/* "You" badge */}
                {m.id === me?.id && (
                  <span className="absolute top-3 right-3 rounded-full bg-[#E8A838]/20 px-2 py-0.5 text-[10px] font-semibold text-[#E8A838]">
                    Tu
                  </span>
                )}

                {/* Admin badge */}
                {m.is_admin && m.id !== me?.id && (
                  <span className="absolute top-3 right-3 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                    Admin
                  </span>
                )}

                <Avatar
                  emoji={m.avatar_emoji}
                  url={m.avatar_url}
                  name={m.name}
                  size="lg"
                  color={m.color}
                />

                <div className="text-center w-full">
                  <p className="font-semibold text-white text-base leading-tight truncate">{m.name}</p>
                  {m.family_role && (
                    <p className="text-xs text-[#E8A838]/80 mt-0.5 truncate">{m.family_role}</p>
                  )}
                </div>

                {/* Arrow indicator */}
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
