import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/storage'
import { notifyMembers } from '@/lib/notifications'

type RouteContext = { params: Promise<{ id: string }> }

// Verify the current member is part of the chat group (or is an admin).
// Returns null on success; otherwise a 403 Response.
async function ensureMembership(
  db: ReturnType<typeof createServerClient>,
  groupId: string,
  member: { id: string; is_admin: boolean }
): Promise<Response | null> {
  if (member.is_admin) return null

  const { data: membership } = await db
    .from('chat_group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('member_id', member.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json(
      { data: null, error: 'Non sei membro di questo gruppo' },
      { status: 403 }
    )
  }
  return null
}

// GET /api/chat/groups/:id/messages?page=1&per_page=30 → PaginatedResponse<ChatMessage>
// Returns paginated messages newest first, updates last_read_at
export async function GET(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { id: groupId } = await params
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const per_page = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') ?? '30', 10)))
  const from = (page - 1) * per_page
  const to = from + per_page - 1

  const db = createServerClient()

  // Membership check — non-admins must be in the group
  const forbidden = await ensureMembership(db, groupId, member)
  if (forbidden) return forbidden

  // Count query
  const { count, error: countError } = await db
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)

  if (countError) {
    return NextResponse.json(
      { data: [], total: 0, page, per_page, has_more: false, error: countError.message },
      { status: 500 }
    )
  }

  const total = count ?? 0

  // Data query (paginated)
  const { data: messages, error } = await db
    .from('chat_messages')
    .select('*, author:members(id, name, avatar_emoji, color)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    return NextResponse.json(
      { data: [], total: 0, page, per_page, has_more: false, error: error.message },
      { status: 500 }
    )
  }

  const data = messages ?? []

  // Update last_read_at for the current member (best-effort)
  await db
    .from('chat_read_status')
    .upsert(
      { group_id: groupId, member_id: member.id, last_read_at: new Date().toISOString() },
      { onConflict: 'group_id,member_id' }
    )

  return NextResponse.json({
    data,
    total,
    page,
    per_page,
    has_more: from + data.length < total,
    error: null,
  })
}

// POST /api/chat/groups/:id/messages → 201 ApiResponse<ChatMessage>
// Accepts either JSON `{ text, message_type?, media_url? }` for text/external-url
// messages, or multipart/form-data with a `file` field for media uploads —
// in which case the file is uploaded server-side and the resulting URL is
// stored on the message. Client must NOT upload to Storage directly because
// the Storage bucket is service_role-gated.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { id: groupId } = await params

  const contentType = req.headers.get('content-type') ?? ''
  const isMultipart = contentType.includes('multipart/form-data')

  let messageType: string
  let mediaUrl: string | null
  let text: string

  if (isMultipart) {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ data: null, error: 'FormData non valido' }, { status: 400 })
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ data: null, error: 'File mancante' }, { status: 400 })
    }

    messageType = (formData.get('message_type') as string | null) ?? 'image'
    text = ((formData.get('text') as string | null) ?? '').trim()

    if (messageType !== 'image' && messageType !== 'document') {
      return NextResponse.json({ data: null, error: 'Tipo messaggio non valido' }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const path = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    try {
      mediaUrl = await uploadImage('chat', file, path)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload fallito'
      return NextResponse.json({ data: null, error: message }, { status: 400 })
    }
  } else {
    let body: { text?: string; message_type?: string; media_url?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
    }

    messageType = body.message_type ?? 'text'
    mediaUrl = body.media_url ?? null
    text = body.text ?? ''

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
  }

  const db = createServerClient()

  // Membership check — non-admins must be in the group
  const forbidden = await ensureMembership(db, groupId, member)
  if (forbidden) return forbidden

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

  // Notifica gli altri membri del gruppo (escluso il mittente). Fire-and-forget
  // — gli errori vengono loggati ma non bloccano la risposta del POST, così
  // l'utente vede subito il messaggio inviato anche se il push service è
  // lento o down.
  const { data: groupMembers } = await db
    .from('chat_group_members')
    .select('member_id')
    .eq('group_id', groupId)

  const recipientIds = ((groupMembers ?? []) as Array<{ member_id: string }>)
    .map((m: { member_id: string }) => m.member_id)
    .filter((id: string) => id !== member.id)

  if (recipientIds.length > 0) {
    // Snippet del body: testo troncato per messaggi di testo, etichetta
    // per allegati. Title = nome del mittente per parallelo con WhatsApp.
    const snippet =
      messageType === 'image'
        ? '📷 Foto'
        : messageType === 'document'
        ? '📎 File'
        : text.length > 80
        ? `${text.slice(0, 80)}…`
        : text

    notifyMembers(
      recipientIds,
      'chat_message',
      member.name,
      snippet,
      `/chat/${groupId}`,
    ).catch((err) => console.error('chat notifyMembers failed:', err))
  }

  return NextResponse.json({ data: enriched ?? message, error: null }, { status: 201 })
}
