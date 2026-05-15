'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { usePushSubscription } from '@/hooks/usePushSubscription'
import { Avatar, Button, useToast } from '@/components/ui'
import { compressImage } from '@/lib/storage'

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
  // Local mirror di member.avatar_url per riflettere subito l'esito di
  // upload / rimozione foto senza aspettare il refresh di useAuth.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(member?.avatar_url ?? null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')

  const [notifyPush, setNotifyPush] = useState(false)
  const [notifyTelegram, setNotifyTelegram] = useState(false)
  const [telegramChatId, setTelegramChatId] = useState('')
  // birth_date come stringa ISO YYYY-MM-DD oppure '' (campo vuoto).
  // Il backend accetta `null` per cancellare; convertiamo qui sotto.
  const [birthDate, setBirthDate] = useState('')

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
    setAvatarUrl(member.avatar_url ?? null)

    // Fetch full member (includes notify_push, notify_telegram, telegram_chat_id)
    fetch(`/api/members/${member.id}`)
      .then((r) => r.json())
      .then((result) => {
        if (result.data) {
          setNotifyPush(result.data.notify_push ?? false)
          setNotifyTelegram(result.data.notify_telegram ?? false)
          setTelegramChatId(result.data.telegram_chat_id ?? '')
          setBirthDate(result.data.birth_date ?? '')
        }
      })
      .catch(() => {})
  }, [member])

  // Auto-heal: se l'utente ha notify_push=true e il browser ha una
  // subscription locale, ri-registriamo silenziosamente al server. Copre
  // il caso in cui il cleanup automatico ha cancellato la riga DB ma il
  // browser ne ha ancora una valida (incident 2026-05-14). Idempotente
  // server-side (upsert su member+endpoint).
  useEffect(() => {
    if (!notifyPush) return
    if (!push.isSubscribed) return
    push.reSync().catch(() => {})
  }, [notifyPush, push.isSubscribed, push])

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
      // Stringa vuota dal form → null nel DB (rimuove la data). Il
      // server valida che, se non null, sia ISO YYYY-MM-DD.
      birth_date: birthDate.trim() || null,
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

  // Upload foto profilo: compressione client-side (max 512px, q 0.85),
  // POST multipart all'endpoint dedicato. La preview si aggiorna subito
  // grazie ad `avatarUrl` locale; in parallelo refresh-iamo useAuth /
  // useMembers per sincronizzare il resto della UI (header con avatar,
  // chat rows, ecc.).
  const handleAvatarUpload = async (file: File) => {
    if (!member) return
    setUploadingPhoto(true)
    try {
      const compressed = await compressImage(file, 512, 0.85)
      const fd = new FormData()
      fd.append('file', compressed)
      const res = await fetch(`/api/members/${member.id}/avatar`, {
        method: 'POST',
        body: fd,
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.data) {
        toast.error(result.error ?? 'Upload fallito')
        return
      }
      setAvatarUrl(result.data.avatar_url ?? null)
      await refreshAuth()
      await refetch()
      toast.success('Foto profilo aggiornata')
      setShowEmojiPicker(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nel caricamento')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Rimozione foto: PATCH con avatar_url=null. L'endpoint esistente
  // accetta gia` il campo per i non-admin (NON_ADMIN_ALLOWED_FIELDS).
  // Non cancella il file dal bucket (cleanup non urgente; spazio
  // negligible per use case familiare).
  const handleAvatarRemove = async () => {
    if (!member) return
    setUploadingPhoto(true)
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: null }),
      })
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        toast.error(result.error ?? 'Rimozione fallita')
        return
      }
      setAvatarUrl(null)
      await refreshAuth()
      await refetch()
      toast.success('Foto profilo rimossa')
    } catch {
      toast.error('Errore di rete')
    } finally {
      setUploadingPhoto(false)
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

        {/* Hidden file input — triggerato dal pulsante "Carica foto" nel
            picker sotto. accept="image/*" su mobile apre la scelta nativa
            tra fotocamera e galleria; lasciamo decidere al SO. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleAvatarUpload(f)
            // Reset cosi` lo stesso file puo` essere ricaricato dopo un errore.
            e.target.value = ''
          }}
        />

        {/* Profile preview */}
        <div className="flex items-center gap-4 rounded-2xl bg-white/5 p-4">
          <div
            className="relative cursor-pointer"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            aria-label="Cambia avatar"
          >
            <Avatar
              emoji={avatarEmoji || member.avatar_emoji}
              url={avatarUrl}
              name={member.name}
              size="lg"
              color={member.color}
            />
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#E8A838] text-[#1a1a2e]">
              {uploadingPhoto ? (
                <div className="h-3 w-3 rounded-full border-2 border-[#1a1a2e] border-t-transparent animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
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

        {/* Avatar picker — foto profilo + griglia emoji come fallback.
            La foto ha precedenza sull'emoji nel componente Avatar, quindi
            la sezione foto vive in alto per comunicare la strada
            preferita. */}
        {showEmojiPicker && (
          <div className="rounded-2xl bg-white/5 p-4 space-y-4">
            {/* Sezione foto profilo */}
            <div>
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">
                Foto profilo
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="flex items-center gap-2 rounded-xl bg-[#E8A838]/15 px-3 py-2 text-xs font-medium text-[#E8A838] hover:bg-[#E8A838]/25 transition-colors disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                  {uploadingPhoto ? 'Caricamento…' : avatarUrl ? 'Cambia foto' : 'Carica foto'}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleAvatarRemove}
                    disabled={uploadingPhoto}
                    className="rounded-xl bg-white/5 px-3 py-2 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Rimuovi foto
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-white/40">
                JPEG, PNG o WebP — la foto viene ridimensionata automaticamente.
              </p>
            </div>

            {/* Separatore + sezione emoji come fallback */}
            <div className="h-px bg-white/5" />

            <div>
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">
                {avatarUrl ? 'Oppure scegli un\'emoji' : 'Scegli emoji avatar'}
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

        {/* Data di nascita — opzionale. Usato per il banner compleanno
         * sul feed e per la push giornaliera. Lasciare vuoto per non
         * comparire nei compleanni. */}
        <div className="rounded-2xl bg-white/5 p-4">
          <label htmlFor="birth-date" className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">
            Data di nascita
          </label>
          <input
            id="birth-date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            // Limite: niente nascite future, niente prima del 1900
            // (vincolo cosmetico: il date picker mostra anni più puliti).
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-[#E8A838]"
          />
          <p className="mt-2 text-[11px] leading-snug text-white/40">
            La useremo per ricordare il tuo compleanno alla famiglia. Lascia vuoto se preferisci di no.
          </p>
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

          {/* Banner "riattiva su questo dispositivo" — appare quando la
           * preferenza notify_push è true sul DB ma il browser di questo
           * device NON ha una subscription attiva. Caso tipico: utente ha
           * disinstallato e reinstallato la PWA, oppure ha cambiato device.
           * Il flag notify_push resta true ma le push non arrivano qui.
           * Tap → enable() rifa permesso + subscription + registra al server. */}
          {notifyPush && !push.isSubscribed && push.support === 'supported' && push.permission !== 'denied' && (
            <button
              type="button"
              disabled={push.isPending}
              onClick={async () => {
                const result = await push.enable()
                if (!result.ok) {
                  toast.error(result.reason)
                  return
                }
                toast.success('Notifiche riattivate su questo dispositivo.')
              }}
              className="w-full text-left rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <p className="text-[13px] font-medium text-amber-300">
                Notifiche disattivate su questo dispositivo
              </p>
              <p className="text-[12px] text-amber-300/70 mt-0.5 leading-snug">
                Le hai attive sul tuo profilo ma non su questo device. Tocca per riattivarle qui.
              </p>
            </button>
          )}

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
