'use client'

import { useState } from 'react'
import { useActivities } from '@/hooks/useActivities'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, BottomSheet, IconPicker, ColorPicker, ParticipantPicker, MiniAvatarStack, MemberLink } from '@/components/ui'
import { ActivityWithDetails, CreateActivityInput, AttendanceStatus, MemberPublic } from '@/types/database'

const DAYS_IT = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
// day_of_week: 1=Mon, 7=Sun (matching Italian week, 0-indexed from Mon)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 7]

const MY_STATUS_PILL: Record<AttendanceStatus | 'pending', string> = {
  confirmed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  skipped: 'bg-white/10 text-white/50 border border-white/10',
  modified: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  pending: 'bg-[#E8A838]/10 text-[#E8A838] border border-[#E8A838]/20',
}

const MY_STATUS_LABEL: Record<AttendanceStatus | 'pending', string> = {
  confirmed: 'Tu: Confermi',
  skipped: 'Tu: Salti',
  modified: 'Tu: Modifichi',
  pending: 'Devi rispondere',
}

function ActivityCard({
  activity,
  currentMemberId,
  onSetMyStatus,
  onClearMyStatus,
}: {
  activity: ActivityWithDetails
  currentMemberId: string | undefined
  onSetMyStatus: (id: string, status: AttendanceStatus) => void
  onClearMyStatus: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const myAttendance = activity.attendances.find((a) => a.member_id === currentMemberId)
  const myStatus = myAttendance?.status ?? null

  // Index attendances by member_id
  const statusOf = new Map(activity.attendances.map((a) => [a.member_id, a.status]))

  // Group participants by their attendance for this week
  const confirmed: MemberPublic[] = []
  const skipped: MemberPublic[] = []
  const modified: MemberPublic[] = []
  const pending: MemberPublic[] = []
  for (const p of activity.participants) {
    const s = statusOf.get(p.id)
    if (s === 'confirmed') confirmed.push(p)
    else if (s === 'skipped') skipped.push(p)
    else if (s === 'modified') modified.push(p)
    else pending.push(p)
  }

  // Tutti i membri di famiglia loggati possono confermare la propria
  // presenza, indipendentemente da participant_ids. Vedi il server
  // (api/activities/:id/attendance) per la stessa logica.
  const canMarkAttendance = !!currentMemberId

  // Map of member_id → MemberPublic for quick lookup in expanded notes section
  const memberById = new Map(activity.participants.map((p) => [p.id, p]))

  const myPillStatus: AttendanceStatus | 'pending' = myStatus ?? 'pending'

  return (
    <div
      className="bg-[#16213e] rounded-2xl overflow-hidden border border-white/5"
      style={{ borderLeft: `3px solid ${activity.color || '#E8A838'}` }}
    >
      <button
        className="w-full text-left px-4 py-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: `${activity.color || '#E8A838'}22` }}
          >
            {activity.icon || '🗓️'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-white text-sm truncate">{activity.title}</p>
              {/* Pill "Tu: Confermi/Salti/..." — mostrata se l'utente ha
               * espresso una scelta su quest'attività (a prescindere
               * dall'essere participant ufficiale). Senza una scelta
               * niente pill: evita "Tu: In attesa" rumoroso per ogni
               * attività della famiglia. */}
              {canMarkAttendance && myStatus && (
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${MY_STATUS_PILL[myPillStatus]}`}>
                  {MY_STATUS_LABEL[myPillStatus]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {activity.time && (
                <span className="text-white/50 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {activity.time}
                </span>
              )}
              {activity.location && (
                <span className="text-white/50 text-xs flex items-center gap-1 truncate">
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  <span className="truncate">{activity.location}</span>
                </span>
              )}
            </div>
            {/* Attendance summary row */}
            {activity.participants.length > 0 && (
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                {confirmed.length > 0 && (
                  <div className="flex items-center gap-1.5" title={`${confirmed.length} confermati`}>
                    <span className="text-emerald-400 text-xs">✓</span>
                    <MiniAvatarStack members={confirmed} max={3} />
                  </div>
                )}
                {modified.length > 0 && (
                  <div className="flex items-center gap-1.5" title={`${modified.length} modificano`}>
                    <span className="text-blue-400 text-xs">✏️</span>
                    <MiniAvatarStack members={modified} max={3} />
                  </div>
                )}
                {skipped.length > 0 && (
                  <div className="flex items-center gap-1.5 opacity-60" title={`${skipped.length} saltano`}>
                    <span className="text-white/40 text-xs">⏭</span>
                    <MiniAvatarStack members={skipped} max={3} />
                  </div>
                )}
                {confirmed.length === 0 && skipped.length === 0 && modified.length === 0 && pending.length > 0 && (
                  <MiniAvatarStack members={pending} max={5} />
                )}
              </div>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Status buttons — visibili a tutti i membri loggati, anche se non
       * pre-selezionati come participant_ids dell'attività. Tutti in
       * famiglia possono dichiarare la propria presenza. */}
      {canMarkAttendance && (
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => onSetMyStatus(activity.id, 'confirmed')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
              myStatus === 'confirmed'
                ? 'bg-emerald-500 text-white'
                : 'bg-white/5 text-white/50 hover:bg-emerald-500/20 hover:text-emerald-300'
            }`}
          >
            Confermo ✅
          </button>
          <button
            onClick={() => onSetMyStatus(activity.id, 'skipped')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
              myStatus === 'skipped'
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            Salto ⏭
          </button>
          <button
            onClick={() => onSetMyStatus(activity.id, 'modified')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
              myStatus === 'modified'
                ? 'bg-blue-500 text-white'
                : 'bg-white/5 text-white/50 hover:bg-blue-500/20 hover:text-blue-300'
            }`}
          >
            Modifico ✏️
          </button>
        </div>
      )}

      {/* Expanded: per-status breakdown + roles + my-clear */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 flex flex-col gap-3">
          {confirmed.length > 0 && (
            <AttendeeRow label="Confermano" tone="emerald" members={confirmed} />
          )}
          {modified.length > 0 && (
            <AttendeeRow label="Modificano" tone="blue" members={modified} />
          )}
          {skipped.length > 0 && (
            <AttendeeRow label="Salteranno" tone="muted" members={skipped} />
          )}
          {pending.length > 0 && (
            <AttendeeRow label="Non hanno risposto" tone="muted" members={pending} />
          )}

          {/* Modified notes from each member who modified */}
          {activity.attendances
            .filter((a) => a.status === 'modified' && a.modified_notes)
            .map((a) => {
              const m = memberById.get(a.member_id)
              return (
                <div key={a.id} className="bg-blue-500/10 rounded-xl px-3 py-2 border border-blue-500/20">
                  <p className="text-blue-300 text-xs">
                    {m && <span className="font-medium">{m.name}: </span>}
                    {a.modified_notes}
                  </p>
                </div>
              )
            })}

          {activity.roles.length > 0 && (
            <div>
              <p className="text-white/40 text-xs mb-2 uppercase tracking-wide">Ruoli</p>
              <div className="flex flex-col gap-1.5">
                {activity.roles.map((role) => {
                  const m = role.member ?? memberById.get(role.member_id)
                  const row = (
                    <>
                      {m && (
                        <Avatar
                          emoji={m.avatar_emoji}
                          url={m.avatar_url}
                          name={m.name}
                          size="sm"
                          color={m.color}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-white/80 text-xs font-medium">{m?.name ?? 'Sconosciuto'}</p>
                        <p className="text-white/40 text-xs">{role.role_label}</p>
                      </div>
                    </>
                  )
                  return m ? (
                    <MemberLink
                      key={role.id}
                      memberId={m.id}
                      ariaLabel={`Apri il profilo di ${m.name}`}
                      className="flex items-center gap-2"
                    >
                      {row}
                    </MemberLink>
                  ) : (
                    <div key={role.id} className="flex items-center gap-2">
                      {row}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {myStatus && (
            <button
              onClick={() => onClearMyStatus(activity.id)}
              className="text-white/40 text-xs hover:text-white/60 transition-colors text-left"
            >
              Annulla la mia risposta
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AttendeeRow({
  label,
  tone,
  members,
}: {
  label: string
  tone: 'emerald' | 'blue' | 'muted'
  members: MemberPublic[]
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'blue'
      ? 'text-blue-300'
      : 'text-white/50'
  return (
    <div>
      <p className={`${toneClass} text-xs font-medium mb-1.5`}>
        {label} <span className="text-white/30">({members.length})</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <MemberLink
            key={m.id}
            memberId={m.id}
            ariaLabel={`Apri il profilo di ${m.name}`}
            className="flex items-center gap-1.5 bg-white/5 rounded-full pl-0.5 pr-2.5 py-0.5"
          >
            <Avatar
              emoji={m.avatar_emoji}
              url={m.avatar_url}
              name={m.name}
              color={m.color}
              size="sm"
            />
            <span className="text-white/80 text-xs">{m.name.split(' ')[0]}</span>
          </MemberLink>
        ))}
      </div>
    </div>
  )
}

const DEFAULT_FORM: CreateActivityInput = {
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

export default function ActivitiesPage() {
  const { member } = useAuth()
  const { activities, isLoading, createActivity, setMyAttendance, clearMyAttendance } = useActivities()
  const { members } = useMembers()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<CreateActivityInput>(DEFAULT_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modNotes, setModNotes] = useState<Record<string, string>>({})
  const [modNotesOpen, setModNotesOpen] = useState<string | null>(null)

  // Group activities by day_of_week
  const grouped = DAY_ORDER.reduce<Record<number, ActivityWithDetails[]>>((acc, day) => {
    acc[day] = activities.filter((a) => a.day_of_week === day && a.is_active)
    return acc
  }, {} as Record<number, ActivityWithDetails[]>)

  const handleSetMyStatus = async (id: string, status: AttendanceStatus) => {
    if (status === 'modified') {
      setModNotesOpen(id)
      return
    }
    await setMyAttendance(id, status)
  }

  const handleModifiedConfirm = async (id: string) => {
    await setMyAttendance(id, 'modified', modNotes[id] ?? '')
    setModNotesOpen(null)
  }

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setIsSubmitting(true)
    const ok = await createActivity(form)
    setIsSubmitting(false)
    if (ok) {
      setSheetOpen(false)
      setForm(DEFAULT_FORM)
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#1a1a2e]/90 backdrop-blur border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-white">Attività</h1>
          <span className="text-xs text-white/40 bg-white/5 rounded-full px-3 py-1">
            {new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-[#16213e] rounded-2xl animate-pulse border border-white/5" />
          ))
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">🗓️</span>
            <p className="text-white/60 text-base">Nessuna attività.</p>
            <p className="text-white/40 text-sm mt-1">Aggiungi la prima attività ricorrente!</p>
          </div>
        ) : (
          DAY_ORDER.map((day, idx) => {
            const dayActivities = grouped[day]
            if (dayActivities.length === 0) return null
            return (
              <section key={day}>
                <h2 className="text-[#E8A838] font-semibold text-sm mb-3 uppercase tracking-wider">
                  {DAYS_IT[idx]}
                </h2>
                <div className="flex flex-col gap-3">
                  {dayActivities.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      currentMemberId={member?.id}
                      onSetMyStatus={handleSetMyStatus}
                      onClearMyStatus={clearMyAttendance}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-[#E8A838] shadow-lg shadow-[#E8A838]/30 flex items-center justify-center text-[#1a1a2e] text-2xl font-bold hover:bg-[#E8A838]/90 active:scale-95 transition-all"
        aria-label="Nuova attività"
      >
        +
      </button>

      {/* Modified notes overlay */}
      {modNotesOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModNotesOpen(null)} />
          <div className="relative w-full bg-[#1a1a2e] rounded-t-2xl p-6 flex flex-col gap-4">
            <h3 className="text-white font-semibold text-base text-center">Note modifica</h3>
            <textarea
              value={modNotes[modNotesOpen] ?? ''}
              onChange={(e) => setModNotes((prev) => ({ ...prev, [modNotesOpen]: e.target.value }))}
              placeholder="Spiega come è stata modificata l'attività..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-[#E8A838]/60"
            />
            <button
              onClick={() => handleModifiedConfirm(modNotesOpen)}
              className="w-full py-3 rounded-xl bg-[#E8A838] text-[#1a1a2e] font-bold text-sm"
            >
              Conferma modifica ✏️
            </button>
          </div>
        </div>
      )}

      {/* Create Activity BottomSheet */}
      <BottomSheet isOpen={sheetOpen} onClose={() => { setSheetOpen(false); setForm(DEFAULT_FORM) }} title="Nuova attività">
        <div className="flex flex-col gap-4 pt-2">
          {/* Icon + Color row */}
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

          {/* Title */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Titolo *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Es. Allenamento calcio"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          {/* Day of week */}
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

          {/* Time */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Orario</label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Luogo</label>
            <input
              value={form.location ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Dove si svolge?"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          {/* Participants */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Partecipanti</label>
            <ParticipantPicker
              members={members}
              selected={form.participant_ids}
              onChange={(ids) => setForm((f) => ({ ...f, participant_ids: ids }))}
            />
          </div>

          {/* Notes */}
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

          <button
            onClick={handleCreate}
            disabled={isSubmitting || !form.title.trim()}
            className="w-full py-3.5 rounded-xl bg-[#E8A838] text-[#1a1a2e] font-bold text-sm disabled:opacity-40 hover:bg-[#E8A838]/90 active:scale-95 transition-all"
          >
            {isSubmitting ? 'Creando...' : 'Crea attività'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
