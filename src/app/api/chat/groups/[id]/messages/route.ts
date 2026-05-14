import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/storage'
import { emit } from '@/lib/notification-events'
import type { ChatMessage, ChatMessageReplyRef, ChatMessageWithAuthor, MemberPublic } from '@/types/database'

type RouteContext = { params: Promise<{ id: string }> }

const DELETED_PLACEHOLDER = '[Messaggio eliminato]'

// Shape della relazione self-join `reply_to` come Supabase ce la consegna:
// solo i campi richiesti + author nested.
type RawReplyJoin = {
  id: string
  text: string
  deleted_at: string | null
  author: { id: string; name: string; color: string } | null
} | null

/**
 * Trasforma il payload Supabase con il join `reply_to` nello shape pulito
 * `ChatMessageWithAuthor`. Applica anche il tombstone per soft-delete:
 *
 *   1. Se il messaggio è esso stesso `deleted_at` non-NULL → `text` viene
 *      sostituito con "[Messaggio eliminato]" PRIMA di lasciare il server,
 *      così il client non vede mai il testo originale anche manipolando
 *      la response.
 *   2. Se il `reply_to` ha `deleted_at` non-NULL → stesso trattamento sulla
 *      citazione embedded.
 *   3. Se `reply_to_message_id` è non-NULL ma il join torna NULL → il
 *      messaggio originale è stato hard-deleted (impossibile col solo
 *      tombstone, ma per robustezza). In quel caso `reply_to` è NULL e la
 *      UI mostrerà comunque "Messaggio eliminato" leggendo lo stato.
 */
function shapeMessage(
  raw: ChatMessage & { author: MemberPublic; reply_to?: RawReplyJoin },
): ChatMessageWithAuthor {
  const text = raw.deleted_at ? DELETED_PLACEHOLDER : raw.text

  let reply_to: ChatMessageReplyRef | null = null
  if (raw.reply_to && raw.reply_to.author) {
    reply_to = {
      id: raw.reply_to.id,
      text: raw.reply_to.deleted_at ? DELETED_PLACEHOLDER : raw.reply_to.text,
      author: raw.reply_to.author,
    }
  }

  return { ...raw, text, reply_to }
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

  // Data query (paginated). Join su author + self-join su reply_to per
  // la citation embedded. Il nested author dentro reply_to serve a colorare
  // la cornice della citazione col colore del membro citato.
  const { data: messages, error } = await db
    .from('chat_messages')
    .select(
      `*,
       author:members!chat_messages_author_id_fkey(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color),
       reply_to:chat_messages!chat_messages_reply_to_message_id_fkey(
         id, text, deleted_at,
         author:members!chat_messages_author_id_fkey(id, name, color)
       )`,
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    return NextResponse.json(
      { data: [], total: 0, page, per_page, has_more: false, error: error.message },
      { status: 500 }
    )
  }

  const data = (messages ?? []).map((m) =>
    shapeMessage(m as ChatMessage & { author: MemberPublic; reply_to?: RawReplyJoin }),
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

  // Fetch arricchito (author + reply_to embedded). Stesso shape della GET.
  const { data: enriched } = await db
    .from('chat_messages')
    .select(
      `*,
       author:members!chat_messages_author_id_fkey(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color),
       reply_to:chat_messages!chat_messages_reply_to_message_id_fkey(
         id, text, deleted_at,
         author:members!chat_messages_author_id_fkey(id, name, color)
       )`,
    )
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

  const shaped = enriched
    ? shapeMessage(enriched as ChatMessage & { author: MemberPublic; reply_to?: RawReplyJoin })
    : message

  return NextResponse.json({ data: shaped, error: null }, { status: 201 })
}
