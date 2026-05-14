import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Finestra di tempo entro cui un autore può modificare il proprio messaggio.
 * Decisione di prodotto: 2 minuti. Lungo abbastanza per correggere un
 * typo o autocorrect, corto abbastanza da impedire di riscrivere la
 * storia di una conversazione.
 */
const EDIT_WINDOW_MS = 2 * 60 * 1000

// PATCH /api/chat/messages/:id { text } → 200 ApiResponse<{ id, edited_at }>
//
// Solo l'autore può modificare. Solo entro EDIT_WINDOW_MS da created_at.
// Niente modifica di messaggi già soft-deleted (tombstone è immutabile).
// Niente modifica di message_type/media_url da qui — la PATCH è solo per
// il testo (il pattern d'uso è "correggi il typo", non "cambia il media").
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()
  if (member instanceof NextResponse) return member

  const { id } = await params

  let body: { text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return NextResponse.json({ data: null, error: 'Il testo è obbligatorio' }, { status: 400 })
  }

  const db = createServerClient()

  const { data: message, error: fetchError } = await db
    .from('chat_messages')
    .select('id, author_id, created_at, deleted_at, message_type')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ data: null, error: fetchError.message }, { status: 500 })
  }
  if (!message) {
    return NextResponse.json({ data: null, error: 'Messaggio non trovato' }, { status: 404 })
  }
  if (message.author_id !== member.id) {
    return NextResponse.json(
      { data: null, error: 'Puoi modificare solo i tuoi messaggi' },
      { status: 403 },
    )
  }
  if (message.deleted_at) {
    return NextResponse.json(
      { data: null, error: 'Il messaggio è stato eliminato' },
      { status: 410 },
    )
  }
  const ageMs = Date.now() - new Date(message.created_at).getTime()
  if (ageMs > EDIT_WINDOW_MS) {
    return NextResponse.json(
      { data: null, error: 'Tempo scaduto per modificare il messaggio' },
      { status: 403 },
    )
  }

  const editedAt = new Date().toISOString()
  const { error: updateError } = await db
    .from('chat_messages')
    .update({ text, edited_at: editedAt })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ data: null, error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id, edited_at: editedAt }, error: null })
}

// DELETE /api/chat/messages/:id → 200 ApiResponse<{ id, deleted_at }>
//
// Soft-delete via tombstone: la riga RESTA per non rompere le reply che
// la citano via reply_to_message_id (vedi 010_chat_message_replies.sql).
// `deleted_at` viene settato a now(); la GET messages sostituisce poi
// `text` con "[Messaggio eliminato]" lato server prima di rispondere.
//
// Idempotente: se il messaggio è già soft-deleted, restituisce 200 con il
// timestamp originale del tombstone (no-op).
//
// Solo l'autore può eliminare. Nessuna finestra di tempo (puoi sempre
// eliminare un tuo messaggio, anche vecchio).
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()
  if (member instanceof NextResponse) return member

  const { id } = await params

  const db = createServerClient()

  const { data: message, error: fetchError } = await db
    .from('chat_messages')
    .select('id, author_id, deleted_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ data: null, error: fetchError.message }, { status: 500 })
  }
  if (!message) {
    return NextResponse.json({ data: null, error: 'Messaggio non trovato' }, { status: 404 })
  }
  if (message.author_id !== member.id) {
    return NextResponse.json(
      { data: null, error: 'Puoi eliminare solo i tuoi messaggi' },
      { status: 403 },
    )
  }

  if (message.deleted_at) {
    return NextResponse.json({ data: { id, deleted_at: message.deleted_at }, error: null })
  }

  const deletedAt = new Date().toISOString()
  const { error: updateError } = await db
    .from('chat_messages')
    .update({ deleted_at: deletedAt })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ data: null, error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id, deleted_at: deletedAt }, error: null })
}
