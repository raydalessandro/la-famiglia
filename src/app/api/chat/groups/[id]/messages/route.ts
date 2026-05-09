import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/chat/groups/:id/messages?page=1&per_page=30 → ApiResponse<ChatMessage[]>
// Returns paginated messages newest first, updates last_read_at
export async function GET(req: NextRequest, { params }: RouteContext) {
  let member
  try {
    member = await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id: groupId } = await params
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') ?? '30', 10)))
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  const db = createServerClient()

  const { data: messages, error } = await db
    .from('chat_messages')
    .select('*, author:members(id, name, avatar_emoji, color)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  // Update last_read_at for the current member
  await db
    .from('chat_read_status')
    .upsert(
      { group_id: groupId, member_id: member.id, last_read_at: new Date().toISOString() },
      { onConflict: 'group_id,member_id' }
    )

  return NextResponse.json({ data: messages ?? [], error: null })
}

// POST /api/chat/groups/:id/messages → 201 ApiResponse<ChatMessage>
// Body: { text?, message_type?, media_url? }
export async function POST(req: NextRequest, { params }: RouteContext) {
  let member
  try {
    member = await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id: groupId } = await params

  let body: { text?: string; message_type?: string; media_url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const messageType = body.message_type ?? 'text'
  const mediaUrl = body.media_url ?? null
  const text = body.text ?? ''

  if (messageType === 'text') {
    if (!text || text.trim() === '') {
      return NextResponse.json({ data: null, error: 'Il testo è obbligatorio' }, { status: 400 })
    }
  } else if (messageType === 'image' || messageType === 'document') {
    if (!mediaUrl) {
      return NextResponse.json({ data: null, error: 'media_url è obbligatorio' }, { status: 400 })
    }
  } else {
    return NextResponse.json({ data: null, error: 'Tipo messaggio non valido' }, { status: 400 })
  }

  const db = createServerClient()

  const { data: message, error } = await db
    .from('chat_messages')
    .insert({
      group_id: groupId,
      author_id: member.id,
      text: text.trim(),
      message_type: messageType,
      media_url: mediaUrl,
    })
    .select('*')
    .single()

  if (error || !message) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Invio fallito' }, { status: 500 })
  }

  // Fetch with author join
  const { data: enriched } = await db
    .from('chat_messages')
    .select('*, author:members(id, name, avatar_emoji, color)')
    .eq('id', message.id)
    .single()

  // Update read status for the sender
  await db
    .from('chat_read_status')
    .upsert(
      { group_id: groupId, member_id: member.id, last_read_at: new Date().toISOString() },
      { onConflict: 'group_id,member_id' }
    )

  return NextResponse.json({ data: enriched ?? message, error: null }, { status: 201 })
}
