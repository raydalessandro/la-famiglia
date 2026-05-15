import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/storage'
import { emit } from '@/lib/notification-events'
import type { ChatMessage, ChatMessageReplyRef, ChatMessageWithAuthor, MemberPublic } from '@/types/database'

type RouteContext = { params: Promise<{ id: string }> }

const DELETED_PLACEHOLDER = '[Messaggio eliminato]'

// Raw shape dei parent messaggi che vengono citati dai reply: stessa forma
// di un ChatMessage con l'author embedded (subset).
type RawParentMessage = ChatMessage & {
  author: { id: string; name: string; color: string } | null
}

/**
 * Applica il tombstone per soft-delete sul testo del messaggio principale
 * e (se presente) sulla citation embedded. Il testo originale di un
 * messaggio eliminato non lascia mai il server: viene sostituito con
 * "[Messaggio eliminato]" PRIMA della response. Stesso trattamento sulla
 * citazione di un messaggio eliminato.
 *
 * `parent` è il parent messaggio già recuperato dalla seconda query (o
 * null se `reply_to_message_id` è null o se il parent non esiste — caso
 * limite con FK ON DELETE SET NULL).
 */
function shapeMessage(
  raw: ChatMessage & { author: MemberPublic },
  parent: RawParentMessage | null,
): ChatMessageWithAuthor {
  const text = raw.deleted_at ? DELETED_PLACEHOLDER : raw.text

  let reply_to: ChatMessageReplyRef | null = null
  if (parent && parent.author) {
    reply_to = {
      id: parent.id,
      text: parent.deleted_at ? DELETED_PLACEHOLDER : parent.text,
      author: parent.author,
    }
  }

  return { ...raw, text, reply_to }
}

/**
 * Recupera in batch i parent messaggi citati da una lista di messaggi.
 * Ritorna una Map id → parent (con author embedded). Niente self-join
 * PostgREST: si fa una IN su `chat_messages` + un join semplice
 * `author:members(...)`. Più robusto del self-join via FK constraint name
 * (che dipende dallo schema cache di PostgREST).
 */
async function fetchReplyParents(
  db: ReturnType<typeof createServerClient>,
  messages: ChatMessage[],
): Promise<Map<string, RawParentMessage>> {
  const parentIds = Array.from(
    new Set(
      messages
        .map((m) => m.reply_to_message_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )
  if (parentIds.length === 0) return new Map()

  const { data: parents } = await db
    .from('chat_messages')
    .select('id, text, deleted_at, author:members(id, name, color)')
    .in('id', parentIds)

  const map = new Map<string, RawParentMessage>()
  for (const p of (parents ?? []) as unknown as RawParentMessage[]) {
    map.set(p.id, p)
  }
  return map
}

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

  // Data query (paginated). Join su author. Per il `reply_to` facciamo
  // una seconda query batch sui parent (vedi fetchReplyParents) invece di
  // un self-join PostgREST: il self-join richiederebbe il nome esatto del
  // FK constraint e il refresh dello schema cache, che si è dimostrato
  // fragile dopo le migration 010/011.
  const { data: messages, error } = await db
    .from('chat_messages')
    .select('*, author:members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    return NextResponse.json(
      { data: [], total: 0, page, per_page, has_more: false, error: error.message },
      { status: 500 }
    )
  }

  const rawMessages = (messages ?? []) as unknown as (ChatMessage & { author: MemberPublic })[]
  const parents = await fetchReplyParents(db, rawMessages)
  const data = rawMessages.map((m) =>
    shapeMessage(m, m.reply_to_message_id ? parents.get(m.reply_to_message_id) ?? null : null),
  )

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
  let replyToMessageId: string | null = null

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
    const replyRaw = formData.get('reply_to_message_id') as string | null
    if (replyRaw && replyRaw.length > 0) replyToMessageId = replyRaw

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
    let body: { text?: string; message_type?: string; media_url?: string; reply_to_message_id?: string | null }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
    }

    messageType = body.message_type ?? 'text'
    mediaUrl = body.media_url ?? null
    text = body.text ?? ''
    if (typeof body.reply_to_message_id === 'string' && body.reply_to_message_id.length > 0) {
      replyToMessageId = body.reply_to_message_id
    }

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

  // Validazione reply_to_message_id: se presente deve esistere ed essere
  // nello STESSO gruppo (impedisce di citare messaggi di altri gruppi
  // tramite un id pinchato dalla rete).
  if (replyToMessageId) {
    const { data: parent } = await db
      .from('chat_messages')
      .select('id, group_id')
      .eq('id', replyToMessageId)
      .maybeSingle()
    if (!parent || parent.group_id !== groupId) {
      return NextResponse.json(
        { data: null, error: 'Messaggio citato non valido' },
        { status: 400 },
      )
    }
  }

  const { data: message, error } = await db
    .from('chat_messages')
    .insert({
      group_id: groupId,
      author_id: member.id,
      text: text.trim(),
      message_type: messageType,
      media_url: mediaUrl,
      reply_to_message_id: replyToMessageId,
    })
    .select('*')
    .single()

  if (error || !message) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Invio fallito' }, { status: 500 })
  }

  // Fetch arricchito (author + reply_to embedded). Stesso shape della GET:
  // join semplice per author + fetch separato del parent reply.
  const { data: enriched } = await db
    .from('chat_messages')
    .select('*, author:members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('id', message.id)
    .single()

  // Update read status for the sender
  await db
    .from('chat_read_status')
    .upsert(
      { group_id: groupId, member_id: member.id, last_read_at: new Date().toISOString() },
      { onConflict: 'group_id,member_id' }
    )

  // Notifica gli altri membri del gruppo. Tutta la logica (chi notificare,
  // come formattare title/body/link) vive in lib/notification-events.ts —
  // questa è solo l'emissione dell'evento.
  emit('chat_message', {
    sender: { id: member.id, name: member.name },
    message: {
      id: message.id,
      group_id: groupId,
      text: text.trim(),
      message_type: messageType,
    },
  }).catch((err) => console.error('emit chat_message failed:', err))

  let shaped: ChatMessageWithAuthor | ChatMessage = message
  if (enriched) {
    const enrichedTyped = enriched as unknown as ChatMessage & { author: MemberPublic }
    const parents = await fetchReplyParents(db, [enrichedTyped])
    shaped = shapeMessage(
      enrichedTyped,
      enrichedTyped.reply_to_message_id ? parents.get(enrichedTyped.reply_to_message_id) ?? null : null,
    )
  }

  return NextResponse.json({ data: shaped, error: null }, { status: 201 })
}
