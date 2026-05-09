import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/events/:id → ApiResponse<Event>
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth()
  } catch (response) {
    return response as Response
  }

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

  const { data: participants } = await db
    .from('event_participants')
    .select('member_id, members(id, name, avatar_emoji, color)')
    .eq('event_id', id)

  return NextResponse.json({ data: { ...event, participants: participants ?? [] }, error: null })
}

// PATCH /api/events/:id → ApiResponse<Event>
// Body: { title?, event_date?, description?, location?, participant_ids? }
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id } = await params

  let body: {
    title?: string
    event_date?: string
    description?: string
    location?: string
    participant_ids?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const { participant_ids, ...fields } = body

  const db = createServerClient()

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
    const { data, error } = await db.from('events').select('*').eq('id', id).single()
    if (error || !data) {
      return NextResponse.json({ data: null, error: 'Evento non trovato' }, { status: 404 })
    }
    event = data
  }

  if (participant_ids !== undefined) {
    await db.from('event_participants').delete().eq('event_id', id)
    if (participant_ids.length > 0) {
      await db.from('event_participants').insert(
        participant_ids.map((mid) => ({ event_id: id, member_id: mid }))
      )
    }
  }

  const { data: participants } = await db
    .from('event_participants')
    .select('member_id, members(id, name, avatar_emoji, color)')
    .eq('event_id', id)

  return NextResponse.json({ data: { ...event, participants: participants ?? [] }, error: null })
}

// DELETE /api/events/:id → ApiResponse<null>
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id } = await params
  const db = createServerClient()

  const { error } = await db.from('events').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: null, error: null })
}
