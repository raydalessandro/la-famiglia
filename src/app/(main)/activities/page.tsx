'use client'

import { useState, useEffect, useRef } from 'react'
import { useActivities } from '@/hooks/useActivities'
import { useWeekEvents } from '@/hooks/useWeekEvents'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, MiniAvatarStack, MemberLink } from '@/components/ui'
import { CreateItemSheet } from '@/components/CreateItemSheet'
import { ActivityWithDetails, CalendarEventWithDetails, AttendanceStatus, MemberPublic } from '@/types/database'

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

// Variante della card per gli eventi one-off. Visualmente speculare a
// ActivityCard ma con tre differenze sostanziali:
//   1. Non ha `participants` (roster) — quindi niente gruppo "Non hanno
//      risposto" (pending). Sotto il modello nuovo gli eventi non hanno
//      roster: solo chi risponde compare nei vari stati.
//   2. Non ha `roles` (concetto solo delle attivita`).
//   3. Mostra la data dell'evento (formato giorno+mese in italiano)
//      perche` un evento one-off vive su una data specifica, mentre
//      l'attivita` e` ricorrente.
function EventCard({
  event,
  currentMemberId,
  onSetMyStatus,
  onClearMyStatus,
}: {
  event: CalendarEventWithDetails
  currentMemberId: string | undefined
  onSetMyStatus: (id: string, status: AttendanceStatus) => void
  onClearMyStatus: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const attendances = event.attendances ?? []
  const myAttendance = attendances.find((a) => a.member_id === currentMemberId)
  const myStatus = (myAttendance?.status ?? null) as AttendanceStatus | null

  const confirmed: MemberPublic[] = []
  const skipped: MemberPublic[] = []
  const modified: MemberPublic[] = []
  for (const a of attendances) {
    if (!a.member) continue
    if (a.status === 'confirmed') confirmed.push(a.member)
    else if (a.status === 'skipped') skipped.push(a.member)
    else if (a.status === 'modified') modified.push(a.member)
  }

  const canMarkAttendance = !!currentMemberId
  const myPillStatus: AttendanceStatus | 'pending' = myStatus ?? 'pending'

  // event_date arriva come YYYY-MM-DD da Supabase. Costruiamo la Date in
  // local time evitando il "off-by-one" tipico di `new Date('2026-05-15')`
  // che e` interpretato come UTC.
  const [y, m, d] = event.event_date.split('-').map(Number)
  const localDate = new Date(y, m - 1, d)
  const dateLabel = localDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

  return (
    <div
      className="bg-[#16213e] rounded-2xl overflow-hidden border border-white/5"
      style={{ borderLeft: `3px solid ${event.color || '#E85D75'}` }}
    >
      <button
        className="w-full text-left px-4 py-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: `${event.color || '#E85D75'}22` }}
          >
            {event.icon || '📅'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-white text-sm truncate">{event.title}</p>
              {canMarkAttendance && myStatus && (
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${MY_STATUS_PILL[myPillStatus]}`}>
                  {MY_STATUS_LABEL[myPillStatus]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {/* Pill data per distinguere visivamente da un'attivita` ricorrente. */}
              <span className="text-[#E85D75] text-xs font-medium uppercase tracking-wider">
                {dateLabel}
              </span>
              {event.event_time && (
                <span className="text-white/50 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {event.event_time}
                </span>
              )}
              {event.location && (
                <span className="text-white/50 text-xs flex items-center gap-1 truncate">
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  <span className="truncate">{event.location}</span>
                </span>
              )}
            </div>
            {/* Riepilogo presenze (solo se almeno uno ha risposto). */}
            {(confirmed.length + skipped.length + modified.length) > 0 && (
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

      {/* Status buttons identici a ActivityCard. */}
      {canMarkAttendance && (
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => onSetMyStatus(event.id, 'confirmed')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
              myStatus === 'confirmed'
                ? 'bg-emerald-500 text-white'
                : 'bg-white/5 text-white/50 hover:bg-emerald-500/20 hover:text-emerald-300'
            }`}
          >
            Confermo ✅
          </button>
          <button
            onClick={() => onSetMyStatus(event.id, 'skipped')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
              myStatus === 'skipped'
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            Salto ⏭
          </button>
          <button
            onClick={() => onSetMyStatus(event.id, 'modified')}
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
          {confirmed.length + skipped.length + modified.length === 0 && (
            <p className="text-white/40 text-xs italic">Nessuna risposta ancora.</p>
          )}

          {/* Note "modifico" dei singoli membri. */}
          {attendances
            .filter((a) => a.status === 'modified' && a.modified_notes)
            .map((a) => (
              <div key={a.id} className="bg-blue-500/10 rounded-xl px-3 py-2 border border-blue-500/20">
                <p className="text-blue-300 text-xs">
                  {a.member && <span className="font-medium">{a.member.name}: </span>}
                  {a.modified_notes}
                </p>
              </div>
            ))}

          {event.notes && (
            <div>
              <p className="text-white/40 text-xs mb-1 uppercase tracking-wide">Note</p>
              <p className="text-white/70 text-xs whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}

          {myStatus && (
            <button
              onClick={() => onClearMyStatus(event.id)}
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

// Striscia orizzontale dei 7 giorni della settimana corrente, sticky in
// alto a /activities come bussola visiva. Stati per giorno:
// - oggi: pill arancione piena con shadow (ancoraggio visivo principale).
// - vuoto: opacita` ridotta (a colpo d'occhio capisci dove non c'e` nulla).
// - dot giallo se almeno un'attivita` ricorrente in quel giorno.
// - dot rosa se almeno un evento one-off.
// - puntino pulsante in alto a destra se c'e` almeno un item su cui io
//   non ho ancora dichiarato la mia presenza.
// Tap su un giorno → smooth scroll alla sezione corrispondente con
// offset per lo sticky header. Al mount, scroll orizzontale auto-centrato
// su "oggi".
type DayStripDay = {
  day: number
  short: string
  dayNumber: number
  hasActivity: boolean
  hasEvent: boolean
  needsResponse: boolean
  isToday: boolean
  isEmpty: boolean
}

function DayStrip({ days }: { days: DayStripDay[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const todayEl = scrollRef.current?.querySelector<HTMLElement>('[data-today="true"]')
    todayEl?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [])

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto px-3 pb-3"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`
        div::-webkit-scrollbar { display: none; }
        @keyframes day-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
      `}</style>
      {days.map((d) => {
        const bgClass = d.isToday
          ? 'bg-[#E8A838] border-[#E8A838]'
          : d.isEmpty
          ? 'bg-transparent border-white/5 opacity-50'
          : 'bg-white/5 border-white/5'
        const shortColor = d.isToday
          ? 'text-[#1a1a2e]/80'
          : d.isEmpty
          ? 'text-white/30'
          : 'text-white/60'
        const numColor = d.isToday
          ? 'text-[#1a1a2e]'
          : d.isEmpty
          ? 'text-white/30'
          : 'text-white'

        return (
          <a
            key={d.day}
            href={`#day-${d.day}`}
            data-today={d.isToday}
            className={`shrink-0 flex flex-col items-center justify-center min-w-[58px] h-[72px] rounded-2xl border relative active:scale-95 transition-transform ${bgClass}`}
            style={d.isToday ? { boxShadow: '0 8px 20px -8px rgba(232, 168, 56, 0.5)' } : undefined}
          >
            <span className={`text-[11px] font-medium uppercase tracking-wide ${shortColor}`}>
              {d.short}
            </span>
            <span className={`text-[20px] font-bold leading-none mt-0.5 ${numColor}`}>
              {d.dayNumber}
            </span>
            <div className="flex gap-1 mt-1.5 h-1">
              {d.hasActivity && (
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ background: d.isToday ? 'rgba(26,26,46,0.6)' : '#E8A838' }}
                />
              )}
              {d.hasEvent && (
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ background: d.isToday ? 'rgba(26,26,46,0.6)' : '#E85D75' }}
                />
              )}
            </div>
            {d.needsResponse && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{
                  background: d.isToday ? '#1a1a2e' : '#E8A838',
                  animation: 'day-pulse 2s ease-in-out infinite',
                }}
              />
            )}
          </a>
        )
      })}
    </div>
  )
}

function FilterTab({
  label,
  active,
  onClick,
  tone,
}: {
  label: string
  active: boolean
  onClick: () => void
  tone: 'neutral' | 'event' | 'activity'
}) {
  const activeClass =
    tone === 'event'
      ? 'bg-[#E85D75] text-white'
      : tone === 'activity'
      ? 'bg-[#E8A838] text-[#1a1a2e]'
      : 'bg-white/15 text-white'
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
        active ? activeClass : 'bg-white/5 text-white/50 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}

// Tab segment per filtrare la vista settimanale. "Tutti" e` la vista
// unificata di default; "Eventi" e "Attivita" isolano un solo tipo.
// Coerente con la separazione concettuale ricorrenti vs one-off:
// l'utente puo` decidere su quale dei due focalizzarsi senza perdere
// l'altro (basta un tap per tornare a "Tutti").
type WeekFilter = 'all' | 'events' | 'activities'

// Item discriminato per la vista settimanale unificata. Un giorno della
// settimana puo` contenere sia attivita` ricorrenti (recurring) che eventi
// one-off accadiati in quella data; entrambi mostrano la stessa interazione
// (Confermo/Salto/Modifico).
type WeekItem =
  | { kind: 'activity'; activity: ActivityWithDetails }
  | { kind: 'event'; event: CalendarEventWithDetails }

// YYYY-MM-DD → 1=Lun..7=Dom. Costruiamo la Date in local time per evitare
// il "off-by-one" tipico di `new Date('2026-05-15')` (UTC).
function eventDayOfWeek(eventDate: string): number {
  const [y, m, d] = eventDate.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay() // 0=Sun, 1=Mon...6=Sat
  return dow === 0 ? 7 : dow
}

// Estrae l'orario per ordinamento entro lo stesso giorno. Le attivita`
// hanno `time` (sempre presente), gli eventi possono avere `event_time` null
// (tutto-il-giorno) → li portiamo in fondo con un sentinel.
function itemSortKey(item: WeekItem): string {
  if (item.kind === 'activity') return item.activity.time
  return item.event.event_time ?? '99:99'
}

export default function ActivitiesPage() {
  const { member } = useAuth()
  const { activities, isLoading: isLoadingActivities, setMyAttendance, clearMyAttendance } = useActivities()
  const {
    events,
    isLoading: isLoadingEvents,
    setMyEventAttendance,
    clearMyEventAttendance,
  } = useWeekEvents()
  const { members } = useMembers()

  const isLoading = isLoadingActivities || isLoadingEvents

  const [sheetOpen, setSheetOpen] = useState(false)
  const [filter, setFilter] = useState<WeekFilter>('all')
  const [modNotes, setModNotes] = useState<Record<string, string>>({})
  const [modNotesOpen, setModNotesOpen] = useState<{ kind: 'activity' | 'event'; id: string } | null>(null)

  // Group activities + events by day_of_week con filtro applicato. Per gli
  // eventi il giorno si deriva dalla event_date in local time. Dentro lo
  // stesso giorno ordiniamo per orario.
  const showActivities = filter !== 'events'
  const showEvents = filter !== 'activities'
  const grouped = DAY_ORDER.reduce<Record<number, WeekItem[]>>((acc, day) => {
    const items: WeekItem[] = [
      ...(showActivities
        ? activities
            .filter((a) => a.day_of_week === day && a.is_active)
            .map((a): WeekItem => ({ kind: 'activity', activity: a }))
        : []),
      ...(showEvents
        ? events
            .filter((e) => eventDayOfWeek(e.event_date) === day)
            .map((e): WeekItem => ({ kind: 'event', event: e }))
        : []),
    ]
    items.sort((a, b) => itemSortKey(a).localeCompare(itemSortKey(b)))
    acc[day] = items
    return acc
  }, {} as Record<number, WeekItem[]>)

  const totalItems = Object.values(grouped).reduce((sum, list) => sum + list.length, 0)

  // Metadati per la day-strip in cima. Tutto derivato da `grouped` +
  // member?.id, nessuna fetch extra. Costruiamo la Date del lunedi`
  // della settimana corrente in local time (no .toISOString() → evita
  // off-by-one al cambio fuso orario).
  const today = new Date()
  const todayDow = today.getDay() === 0 ? 7 : today.getDay() // 1=Lun..7=Dom
  const monday = new Date(today)
  monday.setDate(today.getDate() - (todayDow - 1))
  const dayShorts = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
  const dayStripData: DayStripDay[] = DAY_ORDER.map((day, idx) => {
    const items = grouped[day]
    const d = new Date(monday)
    d.setDate(monday.getDate() + idx)
    const hasActivity = items.some((i) => i.kind === 'activity')
    const hasEvent = items.some((i) => i.kind === 'event')
    // "Necessita risposta" = almeno un item dove il membro corrente non
    // ha ancora dichiarato lo stato. `event.attendances` e` opzionale
    // sul type, fallback a [].
    const needsResponse = !!member?.id && items.some((i) => {
      const attendances = i.kind === 'activity' ? i.activity.attendances : (i.event.attendances ?? [])
      return !attendances.find((a) => a.member_id === member.id)
    })
    return {
      day,
      short: dayShorts[idx],
      dayNumber: d.getDate(),
      hasActivity,
      hasEvent,
      needsResponse,
      isToday: day === todayDow,
      isEmpty: items.length === 0,
    }
  })

  const handleSetMyActivityStatus = async (id: string, status: AttendanceStatus) => {
    if (status === 'modified') {
      setModNotesOpen({ kind: 'activity', id })
      return
    }
    await setMyAttendance(id, status)
  }

  const handleSetMyEventStatus = async (id: string, status: AttendanceStatus) => {
    if (status === 'modified') {
      setModNotesOpen({ kind: 'event', id })
      return
    }
    await setMyEventAttendance(id, status)
  }

  const handleModifiedConfirm = async () => {
    if (!modNotesOpen) return
    const { kind, id } = modNotesOpen
    const note = modNotes[`${kind}-${id}`] ?? ''
    if (kind === 'activity') {
      await setMyAttendance(id, 'modified', note)
    } else {
      await setMyEventAttendance(id, 'modified', note)
    }
    setModNotesOpen(null)
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] pb-24">
      {/* Header + tab filter. Sticky cosi`il filtro resta visibile mentre
          scorri la settimana. Color-coding: rosa per Eventi, giallo per
          Attivita`, neutro per "Tutti" — rafforza la distinzione visiva
          tra i due concetti che oggi condividono la stessa interazione. */}
      <div className="sticky top-0 z-30 bg-[#1a1a2e]/90 backdrop-blur border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-white">Settimana</h1>
          <span className="text-xs text-white/40 bg-white/5 rounded-full px-3 py-1">
            {new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
          </span>
        </div>
        <DayStrip days={dayStripData} />
        <div className="px-4 pb-3 flex gap-2">
          <FilterTab label="Tutti" active={filter === 'all'} onClick={() => setFilter('all')} tone="neutral" />
          <FilterTab label="📅 Eventi" active={filter === 'events'} onClick={() => setFilter('events')} tone="event" />
          <FilterTab label="🔁 Attività" active={filter === 'activities'} onClick={() => setFilter('activities')} tone="activity" />
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-[#16213e] rounded-2xl animate-pulse border border-white/5" />
          ))
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">🗓️</span>
            <p className="text-white/60 text-base">
              {filter === 'events'
                ? 'Nessun evento questa settimana.'
                : filter === 'activities'
                ? 'Nessuna attività questa settimana.'
                : 'Niente questa settimana.'}
            </p>
            <p className="text-white/40 text-sm mt-1">Tocca + per aggiungere.</p>
          </div>
        ) : (
          DAY_ORDER.map((day, idx) => {
            const dayItems = grouped[day]
            if (dayItems.length === 0) return null
            return (
              <section key={day} id={`day-${day}`} className="scroll-mt-[220px]">
                <h2 className="text-[#E8A838] font-semibold text-sm mb-3 uppercase tracking-wider">
                  {DAYS_IT[idx]}
                </h2>
                <div className="flex flex-col gap-3">
                  {dayItems.map((item) =>
                    item.kind === 'activity' ? (
                      <ActivityCard
                        key={`a-${item.activity.id}`}
                        activity={item.activity}
                        currentMemberId={member?.id}
                        onSetMyStatus={handleSetMyActivityStatus}
                        onClearMyStatus={clearMyAttendance}
                      />
                    ) : (
                      <EventCard
                        key={`e-${item.event.id}`}
                        event={item.event}
                        currentMemberId={member?.id}
                        onSetMyStatus={handleSetMyEventStatus}
                        onClearMyStatus={clearMyEventAttendance}
                      />
                    )
                  )}
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
        aria-label="Crea evento o attività"
      >
        +
      </button>

      {/* Modified notes overlay. Stessa UX per attivita` ed eventi:
          discriminator nella state determina l'API da chiamare al confirm. */}
      {modNotesOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModNotesOpen(null)} />
          <div className="relative w-full bg-[#1a1a2e] rounded-t-2xl p-6 flex flex-col gap-4">
            <h3 className="text-white font-semibold text-base text-center">Note modifica</h3>
            <textarea
              value={modNotes[`${modNotesOpen.kind}-${modNotesOpen.id}`] ?? ''}
              onChange={(e) =>
                setModNotes((prev) => ({
                  ...prev,
                  [`${modNotesOpen.kind}-${modNotesOpen.id}`]: e.target.value,
                }))
              }
              placeholder={
                modNotesOpen.kind === 'activity'
                  ? "Spiega come è stata modificata l'attività..."
                  : 'Spiega come hai modificato la tua partecipazione...'
              }
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-[#E8A838]/60"
            />
            <button
              onClick={handleModifiedConfirm}
              className="w-full py-3 rounded-xl bg-[#E8A838] text-[#1a1a2e] font-bold text-sm"
            >
              Conferma modifica ✏️
            </button>
          </div>
        </div>
      )}

      {/* Create item sheet unificata: default su 'activity' qui (pagina
          Attivita`/Settimana), ma con toggle interno per creare anche
          eventi senza navigare a /calendar. */}
      <CreateItemSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        defaultKind="activity"
        members={members}
      />
    </div>
  )
}
