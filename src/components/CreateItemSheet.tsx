'use client'

import { useEffect, useState } from 'react'
import { BottomSheet, IconPicker, ColorPicker, ParticipantPicker, Button } from '@/components/ui'
import {
  CreateActivityInput,
  CreateEventInput,
  MemberPublic,
  ApiResponse,
} from '@/types/database'

const DAYS_IT = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

type Kind = 'activity' | 'event'

type Props = {
  isOpen: boolean
  onClose: () => void
  defaultKind: Kind
  // Quando la sheet viene aperta dal calendario con un giorno selezionato,
  // il form Evento parte gia` precompilato su quella data.
  defaultEventDate?: string
  members: MemberPublic[]
}

const DEFAULT_ACTIVITY: CreateActivityInput = {
  title: '',
  icon: '🗓️',
  color: '#E8A838',
  day_of_week: 1,
  time: '09:00',
  location: '',
  notes: '',
  participant_ids: [],
  roles: [],
}

function buildDefaultEvent(date?: string): CreateEventInput {
  return {
    title: '',
    icon: '📅',
    color: '#E85D75',
    event_date: date ?? new Date().toISOString().slice(0, 10),
    event_time: '',
    location: '',
    notes: '',
    participant_ids: [],
  }
}

// Sheet unificata per creare un'attivita ricorrente o un evento one-off.
// Il toggle in alto seleziona quale form mostrare; lo state dei due form
// e` separato cosi switchare avanti/indietro non perde quello che stavi
// scrivendo. Il submit chiama l'endpoint giusto (/api/activities oppure
// /api/events) e la pagina chiamante si aggiorna via realtime
// (subscriptions su `activities` / `events` gia` esistenti).
export function CreateItemSheet({ isOpen, onClose, defaultKind, defaultEventDate, members }: Props) {
  const [kind, setKind] = useState<Kind>(defaultKind)
  const [activityForm, setActivityForm] = useState<CreateActivityInput>(DEFAULT_ACTIVITY)
  const [eventForm, setEventForm] = useState<CreateEventInput>(() => buildDefaultEvent(defaultEventDate))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quando la sheet viene riaperta cambiando defaultKind o defaultEventDate
  // (es. l'utente apre da un giorno specifico del calendario) ri-sincronizza
  // il kind e la data evento. Non resettiamo il titolo/note se l'utente
  // aveva gia` iniziato a scrivere.
  useEffect(() => {
    if (isOpen) {
      setKind(defaultKind)
      if (defaultEventDate) {
        setEventForm((f) => ({ ...f, event_date: defaultEventDate }))
      }
    }
  }, [isOpen, defaultKind, defaultEventDate])

  const resetAndClose = () => {
    setActivityForm(DEFAULT_ACTIVITY)
    setEventForm(buildDefaultEvent(defaultEventDate))
    setError(null)
    onClose()
  }

  const handleCreate = async () => {
    setError(null)
    if (kind === 'activity') {
      if (!activityForm.title.trim()) return
      setIsSubmitting(true)
      try {
        const res = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(activityForm),
        })
        const data: ApiResponse<unknown> = await res.json()
        if (!res.ok || data.error) {
          setError(data.error ?? 'Creazione fallita')
          return
        }
        resetAndClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Creazione fallita')
      } finally {
        setIsSubmitting(false)
      }
    } else {
      if (!eventForm.title.trim()) return
      if (!eventForm.event_date) {
        setError('La data è obbligatoria')
        return
      }
      setIsSubmitting(true)
      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventForm),
        })
        const data: ApiResponse<unknown> = await res.json()
        if (!res.ok || data.error) {
          setError(data.error ?? 'Creazione fallita')
          return
        }
        resetAndClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Creazione fallita')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={resetAndClose}
      title={kind === 'activity' ? 'Nuova attività' : 'Nuovo evento'}
    >
      <div className="flex flex-col gap-4 pt-2">
        {/* Toggle Evento / Attivita`. Pre-selezionato dal defaultKind della
            pagina ma swappabile sempre, cosi posso creare un evento da
            /attivita o un'attivita` da /calendar senza cambiare pagina. */}
        <div className="flex gap-2 bg-white/5 rounded-xl p-1">
          <button
            onClick={() => setKind('event')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              kind === 'event'
                ? 'bg-[#E85D75] text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            📅 Evento <span className="opacity-60 font-normal">(una volta)</span>
          </button>
          <button
            onClick={() => setKind('activity')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              kind === 'activity'
                ? 'bg-[#E8A838] text-[#1a1a2e]'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            🔁 Attività <span className="opacity-60 font-normal">(ogni settimana)</span>
          </button>
        </div>

        {kind === 'activity' ? (
          <ActivityFields form={activityForm} setForm={setActivityForm} members={members} />
        ) : (
          <EventFields form={eventForm} setForm={setEventForm} members={members} />
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <Button
          onClick={handleCreate}
          disabled={isSubmitting || (kind === 'activity' ? !activityForm.title.trim() : !eventForm.title.trim())}
          loading={isSubmitting}
          fullWidth
        >
          {isSubmitting ? 'Creando...' : kind === 'activity' ? 'Crea attività' : 'Crea evento'}
        </Button>
      </div>
    </BottomSheet>
  )
}

function ActivityFields({
  form,
  setForm,
  members,
}: {
  form: CreateActivityInput
  setForm: (updater: (f: CreateActivityInput) => CreateActivityInput) => void
  members: MemberPublic[]
}) {
  return (
    <>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-white/50 text-xs mb-1.5 block">Icona</label>
          <IconPicker value={form.icon ?? '🗓️'} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
        </div>
        <div className="flex-1">
          <label className="text-white/50 text-xs mb-1.5 block">Colore</label>
          <ColorPicker value={form.color ?? '#E8A838'} onChange={(color) => setForm((f) => ({ ...f, color }))} />
        </div>
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Titolo *</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Es. Allenamento calcio"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E8A838]/60"
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Giorno della settimana</label>
        <div className="flex gap-1 flex-wrap">
          {DAYS_IT.map((day, idx) => (
            <button
              key={idx}
              onClick={() => setForm((f) => ({ ...f, day_of_week: idx + 1 }))}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                form.day_of_week === idx + 1
                  ? 'bg-[#E8A838] text-[#1a1a2e]'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Orario</label>
        <input
          type="time"
          value={form.time}
          onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E8A838]/60"
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Luogo</label>
        <input
          value={form.location ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="Dove si svolge?"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E8A838]/60"
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Partecipanti abituali</label>
        <ParticipantPicker
          members={members}
          selected={form.participant_ids}
          onChange={(ids) => setForm((f) => ({ ...f, participant_ids: ids }))}
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Note</label>
        <textarea
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Note aggiuntive..."
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-[#E8A838]/60"
        />
      </div>
    </>
  )
}

function EventFields({
  form,
  setForm,
  members,
}: {
  form: CreateEventInput
  setForm: (updater: (f: CreateEventInput) => CreateEventInput) => void
  members: MemberPublic[]
}) {
  return (
    <>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-white/50 text-xs mb-1.5 block">Icona</label>
          <IconPicker value={form.icon ?? '📅'} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
        </div>
        <div className="flex-1">
          <label className="text-white/50 text-xs mb-1.5 block">Colore</label>
          <ColorPicker value={form.color ?? '#E85D75'} onChange={(color) => setForm((f) => ({ ...f, color }))} />
        </div>
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Titolo *</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Nome dell'evento"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E85D75]/60"
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Data *</label>
        <input
          type="date"
          value={form.event_date}
          onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E85D75]/60"
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Orario (opzionale)</label>
        <input
          type="time"
          value={form.event_time ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E85D75]/60"
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Luogo</label>
        <input
          value={form.location ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="Dove?"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E85D75]/60"
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Avvisa</label>
        <ParticipantPicker
          members={members}
          selected={form.participant_ids ?? []}
          onChange={(ids) => setForm((f) => ({ ...f, participant_ids: ids }))}
        />
      </div>

      <div>
        <label className="text-white/50 text-xs mb-1.5 block">Note</label>
        <textarea
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Dettagli aggiuntivi..."
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-[#E85D75]/60"
        />
      </div>
    </>
  )
}
