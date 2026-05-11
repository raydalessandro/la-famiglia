'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { usePushSubscription } from '@/hooks/usePushSubscription'
import { Avatar, Button, useToast } from '@/components/ui'

const EMOJI_OPTIONS = [
  '😊','😎','🥳','🤩','😴','🧑','👩','👨','🧒','👧','👦',
  '🧓','👴','👵','🦁','🐯','🐻','🐼','🦊','🐨','🦋','🌟',
  '🍕','🎸','⚽','🏊','🌺','🌙','☀️','🌈',
]

export default function SettingsPage() {
  const router = useRouter()
  const { member, logout, refreshAuth } = useAuth()
  const { refetch } = useMembers()

  const [bio, setBio] = useState(member?.bio ?? '')
  const [avatarEmoji, setAvatarEmoji] = useState(member?.avatar_emoji ?? '')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')

  const [notifyPush, setNotifyPush] = useState(false)
  const [notifyTelegram, setNotifyTelegram] = useState(false)
  const [telegramChatId, setTelegramChatId] = useState('')

  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const toast = useToast()

  // Web Push lifecycle: support/permission/subscription state + enable/disable.
  // Il toggle "Notifiche push" qui sotto pilota questo hook + la preferenza
  // notify_push sul DB. Se enable fallisce (es. permesso negato), facciamo
  // rollback del flag così l'UI non mente all'utente.
  const push = usePushSubscription()

  // Fetch full member data (including notification prefs) on mount
  useEffect(() => {
    if (!member) return
    setBio(member.bio ?? '')
    setAvatarEmoji(member.avatar_emoji ?? '')

    // Fetch full member (includes notify_push, notify_telegram, telegram_chat_id)
    fetch(`/api/members/${member.id}`)
      .then((r) => r.json())
      .then((result) => {
        if (result.data) {
          setNotifyPush(result.data.notify_push ?? false)
          setNotifyTelegram(result.data.notify_telegram ?? false)
          setTelegramChatId(result.data.telegram_chat_id ?? '')
        }
      })
      .catch(() => {})
  }, [member])

  if (!member) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#1a1a2e]">
        <div className="h-8 w-8 rounded-full border-2 border-[#E8A838] border-t-transparent animate-spin" />
      </div>
    )
  }

  const validatePin = () => {
    if (!currentPin && !newPin && !confirmPin) return true // Not changing PIN
    if (!currentPin) { setPinError('Inserisci il PIN corrente'); return false }
    if (newPin.length < 4) { setPinError('Il nuovo PIN deve avere almeno 4 cifre'); return false }
    if (!/^\d+$/.test(newPin)) { setPinError('Il PIN deve contenere solo numeri'); return false }
    if (newPin !== confirmPin) { setPinError('I PIN non corrispondono'); return false }
    return true
  }

  const handleSave = async () => {
    setPinError('')

    if (!validatePin()) return

    setSaving(true)

    const body: Record<string, unknown> = {
      bio,
      avatar_emoji: avatarEmoji || null,
      notify_push: notifyPush,
      notify_telegram: notifyTelegram,
      telegram_chat_id: notifyTelegram ? telegramChatId.trim() || null : null,
    }

    if (currentPin && newPin) {
      body.current_pin = currentPin
      body.new_pin = newPin
    }

    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setCurrentPin('')
        setNewPin('')
        setConfirmPin('')
        await refreshAuth()
        await refetch()
        toast.success('Impostazioni salvate')
      } else {
        const result = await res.json()
        toast.error(result.error ?? 'Errore nel salvataggio. Riprova.')
      }
    } catch {
      toast.error('Errore di rete. Riprova.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    router.replace('/login')
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#1a1a2e] px-4 py-4">
        <h1 className="text-xl font-bold text-[#E8A838]">Impostazioni</h1>
      </div>

      <div className="px-4 py-5 space-y-6 pb-28">

        {/* Profile preview */}
        <div className="flex items-center gap-4 rounded-2xl bg-white/5 p-4">
          <div
            className="relative cursor-pointer"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            aria-label="Cambia emoji avatar"
          >
            <Avatar
              emoji={avatarEmoji || member.avatar_emoji}
              url={member.avatar_url}
              name={member.name}
              size="lg"
              color={member.color}
            />
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#E8A838] text-[#1a1a2e]">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
          </div>
          <div>
            <p className="font-bold text-lg text-white">{member.name}</p>
            {member.family_role && (
              <p className="text-sm text-[#E8A838]">{member.family_role}</p>
            )}
            {member.is_admin && (
              <span className="inline-block mt-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                Amministratore
              </span>
            )}
          </div>
        </div>

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">
              Scegli emoji avatar
            </p>
            <div className="grid grid-cols-8 gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { setAvatarEmoji(emoji); setShowEmojiPicker(false) }}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-all ${
                    avatarEmoji === emoji
                      ? 'ring-2 ring-[#E8A838] bg-[#E8A838]/20 scale-110'
                      : 'hover:bg-white/10'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setAvatarEmoji(''); setShowEmojiPicker(false) }}
              className="mt-3 text-xs text-white/40 hover:text-white/70 underline"
            >
              Rimuovi emoji
            </button>
          </div>
        )}

        {/* Bio */}
        <div className="rounded-2xl bg-white/5 p-4">
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">
            Biografia
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Raccontaci qualcosa di te…"
            rows={3}
            maxLength={300}
            className="w-full resize-none rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838]"
          />
          <p className="text-right text-[10px] text-white/30 mt-1">{bio.length}/300</p>
        </div>

        {/* Change PIN */}
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">
            Cambia PIN
          </p>
          <div className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) => { setCurrentPin(e.target.value); setPinError('') }}
              placeholder="PIN corrente"
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838] tracking-widest"
            />
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => { setNewPin(e.target.value); setPinError('') }}
              placeholder="Nuovo PIN (min. 4 cifre)"
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838] tracking-widest"
            />
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => { setConfirmPin(e.target.value); setPinError('') }}
              placeholder="Conferma nuovo PIN"
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838] tracking-widest"
            />
            {pinError && <p className="text-xs text-red-400">{pinError}</p>}
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-2xl bg-white/5 p-4 space-y-4">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">
            Notifiche
          </p>

          {/* Push — pilotato dal hook usePushSubscription: a differenza
           * di Telegram (solo preferenza DB), qui il toggle fa subito il
           * lavoro tecnico (permesso browser + PushManager) perché serve
           * una user gesture per il prompt. Il flag notify_push viene
           * sincronizzato via PATCH solo se il sub/unsub va a buon fine. */}
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-sm font-medium text-white">Notifiche push</p>
              <p className="text-xs text-white/40 mt-0.5">
                {push.support === 'needs-pwa-install'
                  ? 'Aggiungi prima l\'app alla schermata Home (Condividi → Aggiungi a Home).'
                  : push.support === 'unsupported'
                  ? 'Questo browser non supporta le notifiche.'
                  : push.permission === 'denied'
                  ? 'Notifiche bloccate — sblocca dalle impostazioni del dispositivo.'
                  : 'Ricevi notifiche sul dispositivo.'}
              </p>
            </div>
            <button
              type="button"
              disabled={push.isPending || push.support !== 'supported' || push.permission === 'denied'}
              onClick={async () => {
                if (notifyPush) {
                  // Off: prima il browser, poi il flag.
                  const result = await push.disable()
                  if (!result.ok) {
                    toast.error(result.reason)
                    return
                  }
                  setNotifyPush(false)
                  await fetch(`/api/members/${member.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notify_push: false }),
                  }).catch(() => {})
                  toast.success('Notifiche disattivate.')
                } else {
                  const result = await push.enable()
                  if (!result.ok) {
                    toast.error(result.reason)
                    return
                  }
                  setNotifyPush(true)
                  await fetch(`/api/members/${member.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notify_push: true }),
                  }).catch(() => {})
                  toast.success('Notifiche attivate.')
                }
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                notifyPush ? 'bg-[#E8A838]' : 'bg-white/20'
              }`}
              role="switch"
              aria-checked={notifyPush}
              aria-label="Attiva o disattiva le notifiche push"
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  notifyPush ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Test push — visibile solo quando l'utente ha attivato le push.
           * Invia una notifica a sé stesso così l'utente può verificare il
           * pipe end-to-end senza dover chiedere a un altro membro di fare
           * un like / commento. Anche utile dopo un cambio device. */}
          {notifyPush && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch('/api/push/test', { method: 'POST' })
                  const json = await res.json().catch(() => null) as { data: { sent: boolean } | null; error: string | null } | null
                  if (!res.ok) {
                    toast.error(json?.error ?? `Errore ${res.status}`)
                    return
                  }
                  if (json?.data?.sent) {
                    toast.success('Notifica inviata. Controlla il dispositivo.')
                  } else {
                    // sent=false: il backend non ha trovato subscription per
                    // questo member, oppure notify_push è false nonostante
                    // il toggle. Probabile desync DB/browser.
                    toast.error('Nessuna subscription registrata. Disattiva e riattiva il toggle.')
                  }
                } catch {
                  toast.error('Errore di rete. Riprova.')
                }
              }}
              className="text-left text-xs text-[#E8A838] underline underline-offset-2 active:opacity-60"
            >
              Invia notifica di prova
            </button>
          )}

          {/* Telegram */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Notifiche Telegram</p>
              <p className="text-xs text-white/40 mt-0.5">Ricevi messaggi via Telegram</p>
            </div>
            <button
              type="button"
              onClick={() => setNotifyTelegram(!notifyTelegram)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                notifyTelegram ? 'bg-[#E8A838]' : 'bg-white/20'
              }`}
              role="switch"
              aria-checked={notifyTelegram}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  notifyTelegram ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Telegram Chat ID */}
          {notifyTelegram && (
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">
                Telegram Chat ID
              </label>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="es. 123456789"
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838]"
              />
            </div>
          )}
        </div>

        {/* Save */}
        <Button onClick={handleSave} loading={saving} fullWidth>
          {saving ? 'Salvataggio…' : 'Salva modifiche'}
        </Button>

        {/* Logout */}
        <Button
          onClick={handleLogout}
          loading={loggingOut}
          variant="destructive"
          fullWidth
        >
          {loggingOut ? 'Uscita…' : "Esci dall'account"}
        </Button>
      </div>
    </div>
  )
}
