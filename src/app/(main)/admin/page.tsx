'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, BottomSheet, IconPicker, Button } from '@/components/ui'
import { MemberPublic } from '@/types/database'

type CreateMemberForm = {
  name: string
  pin: string
  avatar_emoji: string
  family_role: string
  is_admin: boolean
}

const INITIAL_FORM: CreateMemberForm = {
  name: '',
  pin: '',
  avatar_emoji: '😊',
  family_role: '',
  is_admin: false,
}

export default function AdminPage() {
  const router = useRouter()
  const { member: me, isAdmin, isLoading: authLoading } = useAuth()
  const { members, isLoading: membersLoading, refetch } = useMembers()

  const [createSheet, setCreateSheet] = useState(false)
  const [form, setForm] = useState<CreateMemberForm>(INITIAL_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [resetTarget, setResetTarget] = useState<MemberPublic | null>(null)
  const [newPinReset, setNewPinReset] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  const [deactivating, setDeactivating] = useState<string | null>(null)

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/')
    }
  }, [authLoading, isAdmin, router])

  if (authLoading || membersLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#1a1a2e]">
        <div className="h-8 w-8 rounded-full border-2 border-[#E8A838] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAdmin) return null

  const handleCreate = async () => {
    const name = form.name.trim()
    if (!name) { setCreateError('Inserisci il nome'); return }
    if (form.pin.length < 4 || !/^\d+$/.test(form.pin)) {
      setCreateError('Il PIN deve contenere almeno 4 cifre numeriche')
      return
    }

    setCreating(true)
    setCreateError('')

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setCreateSheet(false)
        setForm(INITIAL_FORM)
        await refetch()
      } else {
        const result = await res.json()
        setCreateError(result.error ?? 'Errore nella creazione del membro')
      }
    } catch {
      setCreateError('Errore di rete. Riprova.')
    } finally {
      setCreating(false)
    }
  }

  const handleDeactivate = async (member: MemberPublic) => {
    if (member.id === me?.id) return
    setDeactivating(member.id)
    try {
      await fetch(`/api/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !member.is_active }),
      })
      await refetch()
    } finally {
      setDeactivating(null)
    }
  }

  const handleResetPin = async () => {
    if (!resetTarget) return
    if (newPinReset.length < 4 || !/^\d+$/.test(newPinReset)) {
      setResetError('Il PIN deve contenere almeno 4 cifre numeriche')
      return
    }
    setResetting(true)
    setResetError('')
    setResetSuccess(false)
    try {
      const res = await fetch(`/api/members/${resetTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_reset_pin: newPinReset }),
      })
      if (res.ok) {
        setResetSuccess(true)
        setNewPinReset('')
        setTimeout(() => {
          setResetTarget(null)
          setResetSuccess(false)
        }, 2000)
      } else {
        const result = await res.json()
        setResetError(result.error ?? 'Errore nel reset del PIN')
      }
    } catch {
      setResetError('Errore di rete. Riprova.')
    } finally {
      setResetting(false)
    }
  }

  const activeMembers = members.filter((m) => m.is_active)
  const inactiveMembers = members.filter((m) => !m.is_active)

  return (
    <div className="min-h-dvh bg-[#1a1a2e] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#1a1a2e] px-4 py-4">
        <h1 className="text-xl font-bold text-[#E8A838]">Amministrazione</h1>
        <p className="text-sm text-white/50 mt-0.5">Gestisci i membri della famiglia</p>
      </div>

      <div className="px-4 py-5 space-y-6 pb-28">

        {/* Active members */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wide">
              Membri attivi ({activeMembers.length})
            </h2>
          </div>

          <div className="space-y-2">
            {activeMembers.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isMe={m.id === me?.id}
                deactivating={deactivating === m.id}
                onResetPin={() => { setResetTarget(m); setNewPinReset(''); setResetError(''); setResetSuccess(false) }}
                onDeactivate={() => handleDeactivate(m)}
              />
            ))}
          </div>
        </div>

        {/* Inactive members */}
        {inactiveMembers.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wide mb-3">
              Membri disattivati ({inactiveMembers.length})
            </h2>
            <div className="space-y-2">
              {inactiveMembers.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isMe={false}
                  inactive
                  deactivating={deactivating === m.id}
                  onResetPin={() => { setResetTarget(m); setNewPinReset(''); setResetError(''); setResetSuccess(false) }}
                  onDeactivate={() => handleDeactivate(m)}
                />
              ))}
            </div>
          </div>
        )}

        {/* App config placeholder */}
        <div className="rounded-2xl bg-white/5 p-4">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wide mb-2">
            Configurazione app
          </h2>
          <p className="text-sm text-white/30">
            Le impostazioni globali dell&apos;applicazione saranno disponibili in una versione futura.
          </p>
        </div>
      </div>

      {/* FAB: create member */}
      <button
        onClick={() => { setCreateSheet(true); setForm(INITIAL_FORM); setCreateError('') }}
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8A838] text-[#1a1a2e] shadow-lg shadow-[#E8A838]/30 active:scale-95 transition-transform"
        aria-label="Aggiungi membro"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Create member sheet */}
      <BottomSheet
        isOpen={createSheet}
        onClose={() => setCreateSheet(false)}
        title="Nuovo membro"
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* Avatar preview */}
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E8A838]/20 text-4xl">
              {form.avatar_emoji || '👤'}
            </div>
          </div>

          {/* Emoji picker */}
          <div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
              Emoji avatar
            </p>
            <IconPicker
              value={form.avatar_emoji}
              onChange={(v) => setForm((f) => ({ ...f, avatar_emoji: v }))}
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
              Nome *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setCreateError('') }}
              placeholder="es. Maria"
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838]"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
              PIN *
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={(e) => { setForm((f) => ({ ...f, pin: e.target.value })); setCreateError('') }}
              placeholder="Minimo 4 cifre"
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838] tracking-widest"
            />
          </div>

          {/* Family role */}
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
              Ruolo in famiglia
            </label>
            <input
              type="text"
              value={form.family_role}
              onChange={(e) => setForm((f) => ({ ...f, family_role: e.target.value }))}
              placeholder="es. Mamma, Papà, Nonna…"
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838]"
            />
          </div>

          {/* Admin toggle */}
          <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Amministratore</p>
              <p className="text-xs text-white/40 mt-0.5">Può gestire i membri</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_admin: !f.is_admin }))}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                form.is_admin ? 'bg-[#E8A838]' : 'bg-white/20'
              }`}
              role="switch"
              aria-checked={form.is_admin}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  form.is_admin ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {createError && <p className="text-xs text-red-400">{createError}</p>}

          <Button onClick={handleCreate} loading={creating} fullWidth>
            {creating ? 'Creazione…' : 'Crea membro'}
          </Button>
        </div>
      </BottomSheet>

      {/* Reset PIN sheet */}
      <BottomSheet
        isOpen={!!resetTarget}
        onClose={() => { setResetTarget(null); setNewPinReset(''); setResetError(''); setResetSuccess(false) }}
        title={`Reset PIN — ${resetTarget?.name ?? ''}`}
      >
        <div className="flex flex-col gap-4 pt-2">
          <p className="text-sm text-white/60">
            Imposta un nuovo PIN per {resetTarget?.name}. Il membro dovrà usarlo al prossimo accesso.
          </p>

          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
              Nuovo PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={newPinReset}
              onChange={(e) => { setNewPinReset(e.target.value); setResetError('') }}
              placeholder="Minimo 4 cifre"
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838] tracking-widest"
            />
          </div>

          {resetError && <p className="text-xs text-red-400">{resetError}</p>}
          {resetSuccess && <p className="text-xs text-green-400">PIN reimpostato con successo!</p>}

          <Button
            onClick={handleResetPin}
            disabled={resetSuccess}
            loading={resetting}
            fullWidth
          >
            {resetting ? 'Reset…' : 'Reimposta PIN'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}

// ─── MemberRow sub-component ──────────────────────────────────────────────────

type MemberRowProps = {
  member: MemberPublic
  isMe: boolean
  inactive?: boolean
  deactivating: boolean
  onResetPin: () => void
  onDeactivate: () => void
}

function MemberRow({ member, isMe, inactive, deactivating, onResetPin, onDeactivate }: MemberRowProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl p-3 ${
        inactive ? 'bg-white/3 opacity-60' : 'bg-white/5'
      }`}
    >
      <Avatar
        emoji={member.avatar_emoji}
        url={member.avatar_url}
        name={member.name}
        size="sm"
        color={member.color}
        ringed={!inactive}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-white truncate">{member.name}</p>
          {isMe && (
            <span className="shrink-0 rounded-full bg-[#E8A838]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#E8A838] uppercase">
              Tu
            </span>
          )}
          {member.is_admin && (
            <span className="shrink-0 rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-bold text-purple-300 uppercase">
              Admin
            </span>
          )}
        </div>
        {member.family_role && (
          <p className="text-xs text-white/40 mt-0.5 truncate">{member.family_role}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Reset PIN */}
        <button
          onClick={onResetPin}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          aria-label={`Reset PIN di ${member.name}`}
          title="Reset PIN"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>

        {/* Activate/Deactivate */}
        {!isMe && (
          <button
            onClick={onDeactivate}
            disabled={deactivating}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              inactive
                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
            } disabled:opacity-40`}
            aria-label={inactive ? `Riattiva ${member.name}` : `Disattiva ${member.name}`}
            title={inactive ? 'Riattiva' : 'Disattiva'}
          >
            {deactivating ? (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : inactive ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
