import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'

// GET /api/events?month=4&year=2026 → ApiResponse<Event[]>
export async function GET(req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)

  const firstDay = new Date(year, month - 1, 1).toISOString().split('T')[0]
  const lastDay = new Date(year, month, 0).toISOString().split('T')[0]

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

  const enriched = await Promise.all(
    (events ?? []).map(async (event) => {
      const { data: participants } = await db
        .from('event_participants')
        .select('member_id, members(id, name, avatar_emoji, color)')
        .eq('event_id', event.id)
      return { ...event, participants: participants ?? [] }
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

  const participantIds = participant_ids ?? []
  if (participantIds.length > 0) {
    await db.from('event_participants').insert(
      participantIds.map((mid) => ({ event_id: event.id, member_id: mid }))
    )

    await notifyMembers(
      participantIds.filter((id) => id !== member.id),
      'new_event',
      `Nuovo evento: ${event.title}`,
      `Il ${event_date}${location ? ` @ ${location}` : ''}`,
      `/calendar`
    )
  }

  // Fetch participants with member details for response
  const { data: participants } = await db
    .from('event_participants')
    .select('member_id, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('event_id', event.id)

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { ...event, participants: (participants ?? []).map((p: Record<string, any>) => p.members) },
    error: null
  }, { status: 201 })
}
