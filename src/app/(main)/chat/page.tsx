'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useChatGroups } from '@/hooks/useChat'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, BottomSheet, ParticipantPicker, Button, RowSkeleton } from '@/components/ui'
import { ChatGroupWithDetails, MemberPublic } from '@/types/database'
import { useRouter } from 'next/navigation'

function formatGroupTime(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'adesso'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}g`
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

function getOtherMember(group: ChatGroupWithDetails, myId: string | undefined): MemberPublic | undefined {
  if (!group.is_direct || !myId) return undefined
  return group.members.find((m) => m.id !== myId)
}

function GroupRow({
  group,
  myId,
}: {
  group: ChatGroupWithDetails
  myId: string | undefined
}) {
  const other = getOtherMember(group, myId)
  const displayName = group.is_direct ? (other?.name ?? 'Chat diretta') : group.name
  const displayEmoji = group.is_direct ? undefined : (group.icon || '💬') // eslint-disable-line @typescript-eslint/no-unused-vars
  const displayColor = group.is_direct ? other?.color : '#E8A838'
  const displayAvatarEmoji = group.is_direct ? other?.avatar_emoji : undefined
  const displayAvatarUrl = group.is_direct ? other?.avatar_url : undefined

  const lastMsg = group.last_message
  const lastText = lastMsg?.text ?? ''
  const lastTime = lastMsg?.created_at

  return (
    <Link
      href={`/chat/${group.id}`}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors active:bg-white/10"
    >
      {/* Avatar / icon */}
      <div className="relative shrink-0">
        {group.is_direct ? (
          <Avatar
            emoji={displayAvatarEmoji}
            url={displayAvatarUrl}
            name={displayName}
            size="md"
            color={displayColor ?? '#E8A838'}
            ringed
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
            style={{ backgroundColor: '#E8A838' + '22', border: '1px solid ' + '#E8A838' + '44' }}
          >
            {group.icon || '💬'}
          </div>
        )}
        {group.unread_count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[#E8A838] text-[#1a1a2e] text-[10px] font-bold flex items-center justify-center px-1 shadow">
            {group.unread_count > 99 ? '99+' : group.unread_count}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`font-semibold text-sm truncate ${group.unread_count > 0 ? 'text-white' : 'text-white/80'}`}>
            {displayName}
          </p>
          {lastTime && (
            <span className={`text-xs shrink-0 ${group.unread_count > 0 ? 'text-[#E8A838]' : 'text-white/30'}`}>
              {formatGroupTime(lastTime)}
            </span>
          )}
        </div>
        {!group.is_direct && group.members.length > 0 && !lastMsg && (
          <p className="text-white/30 text-xs mt-0.5 truncate">
            {group.members.map((m) => m.name).join(', ')}
          </p>
        )}
        {lastText && (
          <p className={`text-xs mt-0.5 truncate ${group.unread_count > 0 ? 'text-white/70' : 'text-white/30'}`}>
            {lastText}
          </p>
        )}
        {!lastText && !group.is_direct && (
          <p className="text-white/20 text-xs mt-0.5">Nessun messaggio ancora</p>
        )}
      </div>
    </Link>
  )
}

export default function ChatPage() {
  const { member } = useAuth()
  const { groups, isLoading, createGroup } = useChatGroups()
  const { members } = useMembers()
  const router = useRouter()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)

  // Separate direct chats from group chats
  const directChats = groups.filter((g) => g.is_direct)
  const groupChats = groups.filter((g) => !g.is_direct)

  const otherMembers = members.filter((m) => m.id !== member?.id && m.is_active)

  const handleCreate = async () => {
    if (!groupName.trim() && selectedMembers.length !== 1) return
    setIsCreating(true)
    const isDirect = selectedMembers.length === 1 && !groupName.trim()
    const newId = await createGroup({
      name: isDirect ? '' : groupName.trim(),
      is_direct: isDirect,
      member_ids: selectedMembers,
    })
    setIsCreating(false)
    if (newId) {
      setSheetOpen(false)
      setGroupName('')
      setSelectedMembers([])
      router.push(`/chat/${newId}`)
    }
  }

  const handleClose = () => {
    setSheetOpen(false)
    setGroupName('')
    setSelectedMembers([])
  }

  const canCreate =
    selectedMembers.length === 1
      ? true
      : selectedMembers.length > 1 && groupName.trim().length > 0

  return (
    <div className="min-h-screen bg-[#1a1a2e] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#1a1a2e]/90 backdrop-blur border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-white">Messaggi</h1>
          {groups.length > 0 && (
            <span className="text-xs text-white/40 bg-white/5 rounded-full px-3 py-1">
              {groups.length} chat
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 px-4 pt-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <span className="text-5xl mb-4">💬</span>
          <p className="text-white/60 text-base">Nessuna chat ancora.</p>
          <p className="text-white/40 text-sm mt-1">Inizia una conversazione con la famiglia!</p>
        </div>
      ) : (
        <div>
          {/* Direct chats */}
          {directChats.length > 0 && (
            <section>
              <p className="px-4 pt-4 pb-2 text-white/40 text-xs uppercase tracking-wider font-medium">
                Diretti
              </p>
              <div className="divide-y divide-white/5">
                {directChats.map((group) => (
                  <GroupRow key={group.id} group={group} myId={member?.id} />
                ))}
              </div>
            </section>
          )}

          {/* Group chats */}
          {groupChats.length > 0 && (
            <section>
              <p className="px-4 pt-4 pb-2 text-white/40 text-xs uppercase tracking-wider font-medium">
                Gruppi
              </p>
              <div className="divide-y divide-white/5">
                {groupChats.map((group) => (
                  <GroupRow key={group.id} group={group} myId={member?.id} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-[#E8A838] shadow-lg shadow-[#E8A838]/30 flex items-center justify-center text-[#1a1a2e] text-2xl font-bold hover:bg-[#E8A838]/90 active:scale-95 transition-all"
        aria-label="Nuova chat"
      >
        +
      </button>

      {/* Create group sheet */}
      <BottomSheet isOpen={sheetOpen} onClose={handleClose} title="Nuova chat">
        <div className="flex flex-col gap-4 pt-2">
          {/* Info hint */}
          <div className="bg-white/5 rounded-xl px-3 py-2.5 border border-white/5">
            <p className="text-white/40 text-xs leading-relaxed">
              Seleziona un membro per una chat diretta, o più membri e dai un nome al gruppo.
            </p>
          </div>

          {/* Group name (shown when multiple selected) */}
          {selectedMembers.length > 1 && (
            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Nome del gruppo *</label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Es. Famiglia, Vacanza 2025..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E8A838]/60"
              />
            </div>
          )}

          {/* Members picker */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">
              Partecipanti{' '}
              {selectedMembers.length > 0 && (
                <span className="text-[#E8A838]">({selectedMembers.length} selezionati)</span>
              )}
            </label>
            <ParticipantPicker
              members={otherMembers}
              selected={selectedMembers}
              onChange={setSelectedMembers}
            />
          </div>

          {/* Preview of selected members */}
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedMembers.map((id) => {
                const m = members.find((mem) => mem.id === id)
                if (!m) return null
                return (
                  <div
                    key={id}
                    className="flex items-center gap-1.5 bg-[#E8A838]/10 border border-[#E8A838]/20 rounded-full px-3 py-1"
                  >
                    <Avatar
                      emoji={m.avatar_emoji}
                      url={m.avatar_url}
                      name={m.name}
                      size="sm"
                      color={m.color}
                    />
                    <span className="text-[#E8A838] text-xs font-medium">{m.name}</span>
                    <button
                      onClick={() => setSelectedMembers((prev) => prev.filter((mid) => mid !== id))}
                      className="text-[#E8A838]/60 hover:text-[#E8A838] ml-0.5"
                      aria-label={`Rimuovi ${m.name}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <Button
            onClick={handleCreate}
            disabled={!canCreate}
            loading={isCreating}
            fullWidth
          >
            {isCreating
              ? 'Creando...'
              : selectedMembers.length === 1
              ? 'Avvia chat diretta'
              : 'Crea gruppo'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
