import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/events/:id → ApiResponse<Event>
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()

  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const db = createServerClient()

  const { data: event, error } = await db
    .from('events')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !event) {
    return NextResponse.json({ data: null, error: 'Evento non trovato' }, { status: 404 })
  }

  const { data: rows } = await db
    .from('event_participants')
    .select('id, event_id, member_id, status, modified_notes, created_at, updated_at, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('event_id', id)

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

  return NextResponse.json({ data: { ...event, participants, attendances }, error: null })
}

// PATCH /api/events/:id → ApiResponse<Event>
// Body: { title?, event_date?, description?, location? }
// Authorization: only creator or admin can update.
//
// Nota: `participant_ids` non è più gestito qui. Dalla migration 015
// `event_participants` è la tabella delle RISPOSTE (status), non un
// roster. Cancellare e re-inserire participant_ids su PATCH come
// faceva l'implementazione precedente sarebbe distruttivo: eliminerebbe
// tutti gli `status='confirmed'/'skipped'/'modified'` già dichiarati
// dagli utenti. Se il body include `participant_ids` lo ignoriamo
// silenziosamente (back-compat con i client vecchi). Le risposte
// presenza vivono in `POST/DELETE /api/events/:id/attendance`.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { id } = await params

  let body: {
    title?: string
    event_date?: string
    description?: string
    location?: string
    // Accettato e ignorato — vedi nota sopra. Non rimosso dal type per
    // non rompere i client vecchi che lo mandano ancora.
    participant_ids?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { participant_ids: _ignoredParticipantIds, ...fields } = body

  const db = createServerClient()

  // Fetch existing event to check authorization
  const { data: existing, error: existingError } = await db
    .from('events')
    .select('*')
    .eq('id', id)
    .single()

  if (existingError || !existing) {
    return NextResponse.json({ data: null, error: 'Evento non trovato' }, { status: 404 })
  }

  // Check authorization: must be creator or admin
  if (existing.created_by !== member.id && !member.is_admin) {
    return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
  }

  // Validate title if provided
  if (fields.title !== undefined) {
    const trimmed = fields.title.trim()
    if (trimmed.length === 0) {
      return NextResponse.json({ data: null, error: 'Titolo obbligatorio' }, { status: 400 })
    }
  }

  const updatePayload: Record<string, unknown> = {}
  if (fields.title !== undefined) updatePayload.title = fields.title.trim()
  if (fields.event_date !== undefined) updatePayload.event_date = fields.event_date
  if (fields.description !== undefined) updatePayload.description = fields.description
  if (fields.location !== undefined) updatePayload.location = fields.location

  let event
  if (Object.keys(updatePayload).length > 0) {
    const { data, error } = await db
      .from('events')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json({ data: null, error: error?.message ?? 'Aggiornamento fallito' }, { status: 500 })
    }
    event = data
  } else {
    event = existing
  }

  // participant_ids INTENZIONALMENTE NON gestito qui (vedi nota sopra).

  const { data: rows } = await db
    .from('event_participants')
    .select('id, event_id, member_id, status, modified_notes, created_at, updated_at, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('event_id', id)

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

  return NextResponse.json({ data: { ...event, participants, attendances }, error: null })
}

// DELETE /api/events/:id → ApiResponse<null>
// Authorization: only creator or admin can delete.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { id } = await params
  const db = createServerClient()

  // Fetch event to check authorization
  const { data: event, error: fetchError } = await db
    .from('events')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !event) {
    return NextResponse.json({ data: null, error: 'Evento non trovato' }, { status: 404 })
  }

  // Check authorization: must be creator or admin
  if (event.created_by !== member.id && !member.is_admin) {
    return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
  }

  const { error } = await db.from('events').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: null, error: null })
}
