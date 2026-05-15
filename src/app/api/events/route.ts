import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'

// GET /api/events → ApiResponse<Event[]>
// Due modalita` di filtro mutuamente esclusive:
//   - ?week_start=YYYY-MM-DD  → ritorna i 7 giorni a partire dal lunedi`
//     dato. Usata dalla pagina Attivita` unificata (vista settimanale).
//   - ?month=4&year=2026      → ritorna il mese intero. Usata dal calendario.
// Default: mese corrente.
export async function GET(req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('week_start')

  let firstDay: string
  let lastDay: string
  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    const [y, m, d] = weekStart.split('-').map(Number)
    const monday = new Date(y, m - 1, d)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const fmt = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    firstDay = fmt(monday)
    lastDay = fmt(sunday)
  } else {
    const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10)
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)
    firstDay = new Date(year, month - 1, 1).toISOString().split('T')[0]
    lastDay = new Date(year, month, 0).toISOString().split('T')[0]
  }

  const db = createServerClient()
  const { data: events, error } = await db
    .from('events')
    .select('*')
    .gte('event_date', firstDay)
    .lte('event_date', lastDay)
    .order('event_date', { ascending: true })

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  // Dalla migration 015 event_participants tiene anche status/modified_notes.
  // `participants` resta in payload per back-compat (sola lista membri).
  // `attendances` e` la nuova vista completa con stato di risposta, consumata
  // dalla pagina Attivita` unificata che mostra confermati/saltati/modificati.
  const enriched = await Promise.all(
    (events ?? []).map(async (event) => {
      const { data: rows } = await db
        .from('event_participants')
        .select('id, event_id, member_id, status, modified_notes, created_at, updated_at, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
        .eq('event_id', event.id)

      const list = rows ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const participants = list.map((r: any) => r.members).filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attendances = list.map((r: any) => ({
        id: r.id,
        event_id: r.event_id,
        member_id: r.member_id,
        status: r.status,
        modified_notes: r.modified_notes,
        created_at: r.created_at,
        updated_at: r.updated_at,
        member: r.members,
      }))

      return { ...event, participants, attendances }
    })
  )

  void member
  return NextResponse.json({ data: enriched, error: null })
}

// POST /api/events → 201 ApiResponse<CalendarEventWithDetails>
// Body: CreateEventInput { title, icon?, color?, event_date, event_time?, location?, notes?, participant_ids? }
export async function POST(req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  let body: {
    title: string
    icon?: string
    color?: string
    event_date: string
    event_time?: string
    location?: string
    notes?: string
    participant_ids?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const { title, icon, color, event_date, event_time, location, notes, participant_ids } = body

  if (!title || title.trim() === '') {
    return NextResponse.json({ data: null, error: 'Il titolo è obbligatorio' }, { status: 400 })
  }
  if (!event_date) {
    return NextResponse.json({ data: null, error: 'La data è obbligatoria' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: event, error } = await db
    .from('events')
    .insert({
      title: title.trim(),
      icon: icon || '📅',
      color: color || '#E85D75',
      event_date,
      event_time: event_time || null,
      location: location || '',
      notes: notes || '',
      created_by: member.id,
    })
    .select('*')
    .single()

  if (error || !event) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Creazione fallita' }, { status: 500 })
  }

  // Dalla migration 015 event_participants e` la tabella delle RISPOSTE
  // (status='confirmed'/'skipped'/'modified'), non piu` un roster
  // pre-selezionato. Non inseriamo righe in autonomia alla creazione
  // dell'evento: se l'utente ha selezionato membri nel form della
  // calendar UI, li trattiamo come "lista a cui notificare l'evento",
  // non come "membri pre-confermati". Pre-confermare per conto di altri
  // significherebbe inventare un consenso che non hanno dato.
  const participantIds = participant_ids ?? []
  if (participantIds.length > 0) {
    await notifyMembers(
      participantIds.filter((id) => id !== member.id),
      'new_event',
      `Nuovo evento: ${event.title}`,
      `Il ${event_date}${location ? ` @ ${location}` : ''}`,
      `/calendar`
    )
  }

  // Nessuna riga in event_participants a questo punto (creazione fresca),
  // ma la pagina Attivita` unificata si aspetta i campi participants/attendances.
  return NextResponse.json({
    data: { ...event, participants: [], attendances: [] },
    error: null
  }, { status: 201 })
}
