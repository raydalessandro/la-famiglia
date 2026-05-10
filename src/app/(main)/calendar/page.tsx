'use client'

import { useState, useMemo } from 'react'
import { useEvents } from '@/hooks/useEvents'
import { useActivities } from '@/hooks/useActivities'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { BottomSheet, IconPicker, ColorPicker, ParticipantPicker, Button } from '@/components/ui'
import { CalendarEventWithDetails, ActivityWithDetails, CreateEventInput } from '@/types/database'

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]
const DAYS_SHORT_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

// day_of_week in DB: 1=Mon, 7=Sun — JS getDay: 0=Sun, 1=Mon...6=Sat
function jsDayToDbDay(jsDay: number): number {
  // 0 (Sun) → 7, 1 (Mon) → 1, ...6 (Sat) → 6
  return jsDay === 0 ? 7 : jsDay
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getMonth() === month - 1) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function getFirstDayOffset(year: number, month: number): number {
  // Mon=0, ... Sun=6
  const d = new Date(year, month - 1, 1)
  return (d.getDay() + 6) % 7
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const DEFAULT_EVENT_FORM: CreateEventInput = {
  title: '',
  icon: '📅',
  color: '#E8A838',
  event_date: new Date().toISOString().slice(0, 10),
  event_time: '',
  location: '',
  notes: '',
  participant_ids: [],
}

export default function CalendarPage() {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1) // 1-indexed
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [daySheetOpen, setDaySheetOpen] = useState(false)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [form, setForm] = useState<CreateEventInput>({ ...DEFAULT_EVENT_FORM })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { events, createEvent } = useEvents(viewMonth, viewYear)
  const { activities } = useActivities()
  const { members } = useMembers()
  useAuth()

  // Build dot map: dateKey → colors[]
  const dotMap = useMemo(() => {
    const map: Record<string, string[]> = {}

    events.forEach((ev) => {
      if (!map[ev.event_date]) map[ev.event_date] = []
      map[ev.event_date].push(ev.color || '#E8A838')
    })

    // Recurring activities: mark every occurrence in this month
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    daysInMonth.forEach((d) => {
      const dbDay = jsDayToDbDay(d.getDay())
      const key = formatDateKey(d)
      activities
        .filter((a) => a.is_active && a.day_of_week === dbDay)
        .forEach((a) => {
          if (!map[key]) map[key] = []
          map[key].push(a.color || '#E8A838')
        })
    })

    return map
  }, [events, activities, viewYear, viewMonth])

  // Events + activities for selected day
  const dayEvents = useMemo((): CalendarEventWithDetails[] => {
    if (!selectedDay) return []
    return events.filter((ev) => ev.event_date === selectedDay)
  }, [events, selectedDay])

  const dayActivities = useMemo((): ActivityWithDetails[] => {
    if (!selectedDay) return []
    const d = new Date(selectedDay)
    const dbDay = jsDayToDbDay(d.getDay())
    return activities.filter((a) => a.is_active && a.day_of_week === dbDay)
  }, [activities, selectedDay])

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstOffset = getFirstDayOffset(viewYear, viewMonth)
  const todayKey = formatDateKey(today)

  const handleDayClick = (key: string) => {
    setSelectedDay(key)
    setDaySheetOpen(true)
  }

  const handleCreateOpen = (dateKey?: string) => {
    setForm({
      ...DEFAULT_EVENT_FORM,
      event_date: dateKey ?? todayKey,
    })
    setCreateSheetOpen(true)
  }

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setIsSubmitting(true)
    const ok = await createEvent(form)
    setIsSubmitting(false)
    if (ok) {
      setCreateSheetOpen(false)
      setForm({ ...DEFAULT_EVENT_FORM })
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#1a1a2e]/90 backdrop-blur border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-white">Calendario</h1>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 pb-4">
          <button
            onClick={prevMonth}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Mese precedente"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <p className="text-white font-semibold text-base">
            {MONTHS_IT[viewMonth - 1]} {viewYear}
          </p>
          <button
            onClick={nextMonth}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Mese successivo"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="px-4 pt-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_SHORT_IT.map((d) => (
            <div key={d} className="text-center text-white/30 text-xs py-2 font-medium">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty offset cells */}
          {Array.from({ length: firstOffset }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {daysInMonth.map((d) => {
            const key = formatDateKey(d)
            const dots = dotMap[key] ?? []
            const isToday = key === todayKey
            const isSelected = key === selectedDay && daySheetOpen

            return (
              <button
                key={key}
                onClick={() => handleDayClick(key)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                  isSelected
                    ? 'bg-[#E8A838] text-[#1a1a2e]'
                    : isToday
                    ? 'bg-[#E8A838]/20 text-[#E8A838]'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                <span className={`text-xs font-semibold ${isSelected ? 'text-[#1a1a2e]' : ''}`}>
                  {d.getDate()}
                </span>
                {dots.length > 0 && (
                  <div className="flex gap-0.5 justify-center">
                    {dots.slice(0, 3).map((color, i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full block"
                        style={{ backgroundColor: isSelected ? '#1a1a2e' : color }}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => handleCreateOpen()}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-[#E8A838] shadow-lg shadow-[#E8A838]/30 flex items-center justify-center text-[#1a1a2e] text-2xl font-bold hover:bg-[#E8A838]/90 active:scale-95 transition-all"
        aria-label="Nuovo evento"
      >
        +
      </button>

      {/* Day detail sheet */}
      <BottomSheet
        isOpen={daySheetOpen}
        onClose={() => setDaySheetOpen(false)}
        title={selectedDay ? new Date(selectedDay + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
      >
        <div className="flex flex-col gap-4 pt-2">
          {dayEvents.length === 0 && dayActivities.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-4xl block mb-2">📭</span>
              <p className="text-white/40 text-sm">Nessun evento in questo giorno.</p>
              <button
                onClick={() => { setDaySheetOpen(false); handleCreateOpen(selectedDay ?? undefined) }}
                className="mt-3 text-[#E8A838] text-sm font-medium"
              >
                Aggiungi evento
              </button>
            </div>
          ) : (
            <>
              {dayEvents.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Eventi</p>
                  <div className="flex flex-col gap-2">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-start gap-3 bg-white/5 rounded-xl px-3 py-3 border border-white/5"
                        style={{ borderLeft: `3px solid ${ev.color || '#E8A838'}` }}
                      >
                        <span className="text-lg">{ev.icon || '📅'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm">{ev.title}</p>
                          {ev.event_time && <p className="text-white/40 text-xs mt-0.5">{ev.event_time}</p>}
                          {ev.location && <p className="text-white/40 text-xs">{ev.location}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dayActivities.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Attività ricorrenti</p>
                  <div className="flex flex-col gap-2">
                    {dayActivities.map((act) => (
                      <div
                        key={act.id}
                        className="flex items-start gap-3 bg-white/5 rounded-xl px-3 py-3 border border-white/5"
                        style={{ borderLeft: `3px solid ${act.color || '#E8A838'}` }}
                      >
                        <span className="text-lg">{act.icon || '🗓️'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm">{act.title}</p>
                          {act.time && <p className="text-white/40 text-xs mt-0.5">{act.time}</p>}
                          {act.location && <p className="text-white/40 text-xs">{act.location}</p>}
                        </div>
                        <span className="text-white/30 text-xs bg-white/5 rounded-full px-2 py-0.5">ricorrente</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => { setDaySheetOpen(false); handleCreateOpen(selectedDay ?? undefined) }}
                className="w-full py-3 rounded-xl border border-dashed border-white/20 text-white/40 text-sm hover:border-[#E8A838]/50 hover:text-[#E8A838] transition-colors"
              >
                + Aggiungi evento in questo giorno
              </button>
            </>
          )}
        </div>
      </BottomSheet>

      {/* Create event sheet */}
      <BottomSheet isOpen={createSheetOpen} onClose={() => setCreateSheetOpen(false)} title="Nuovo evento">
        <div className="flex flex-col gap-4 pt-2">
          {/* Icon + Color */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-white/50 text-xs mb-1.5 block">Icona</label>
              <IconPicker value={form.icon ?? '📅'} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
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
              placeholder="Nome dell'evento"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Data</label>
            <input
              type="date"
              value={form.event_date}
              onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          {/* Time */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Orario (opzionale)</label>
            <input
              type="time"
              value={form.event_time ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Luogo</label>
            <input
              value={form.location ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Dove?"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          {/* Participants */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Partecipanti</label>
            <ParticipantPicker
              members={members}
              selected={form.participant_ids ?? []}
              onChange={(ids) => setForm((f) => ({ ...f, participant_ids: ids }))}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Note</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Dettagli aggiuntivi..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={!form.title.trim()}
            loading={isSubmitting}
            fullWidth
          >
            {isSubmitting ? 'Creando...' : 'Crea evento'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
