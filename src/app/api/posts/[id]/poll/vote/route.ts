import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

type RouteContext = { params: Promise<{ id: string }> }

// POST /api/posts/:id/poll/vote { option_id } → 201 created or 200 idempotent
//
// Vota un'opzione del sondaggio del post.
//   • single-choice (multi_choice = false) → sostituisce il voto precedente.
//   • multi-choice (multi_choice = true)   → aggiunge il voto; idempotente
//     se già presente sulla stessa opzione.
// Se il sondaggio è chiuso (closes_at < now), restituisce 403.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()
  if (member instanceof NextResponse) return member

  const { id: post_id } = await params

  let body: { option_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const option_id = body.option_id
  if (typeof option_id !== 'string' || option_id.length === 0) {
    return NextResponse.json({ data: null, error: 'option_id obbligatorio' }, { status: 400 })
  }

  const db = createServerClient()

  const { data: poll, error: pollError } = await db
    .from('post_polls')
    .select('id, multi_choice, closes_at')
    .eq('post_id', post_id)
    .maybeSingle()

  if (pollError) {
    return NextResponse.json({ data: null, error: pollError.message }, { status: 500 })
  }
  if (!poll) {
    return NextResponse.json({ data: null, error: 'Sondaggio non trovato' }, { status: 404 })
  }

  if (poll.closes_at && new Date(poll.closes_at).getTime() < Date.now()) {
    return NextResponse.json({ data: null, error: 'Il sondaggio è chiuso' }, { status: 403 })
  }

  // Verifica che l'opzione appartenga al sondaggio.
  const { data: option, error: optionError } = await db
    .from('post_poll_options')
    .select('id')
    .eq('id', option_id)
    .eq('poll_id', poll.id)
    .maybeSingle()

  if (optionError) {
    return NextResponse.json({ data: null, error: optionError.message }, { status: 500 })
  }
  if (!option) {
    return NextResponse.json({ data: null, error: 'Opzione non valida' }, { status: 400 })
  }

  // Idempotenza: stesso voto già presente?
  const { data: existing } = await db
    .from('post_poll_votes')
    .select('id')
    .eq('poll_id', poll.id)
    .eq('option_id', option_id)
    .eq('member_id', member.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ data: { vote: existing }, error: null }, { status: 200 })
  }

  // Single-choice: rimuovi i voti precedenti del membro su questo sondaggio.
  if (!poll.multi_choice) {
    const { error: clearError } = await db
      .from('post_poll_votes')
      .delete()
      .eq('poll_id', poll.id)
      .eq('member_id', member.id)
    if (clearError) {
      return NextResponse.json({ data: null, error: clearError.message }, { status: 500 })
    }
  }

  const { data: vote, error: insertError } = await db
    .from('post_poll_votes')
    .insert({ poll_id: poll.id, option_id, member_id: member.id })
    .select('*')
    .single()

  if (insertError || !vote) {
    return NextResponse.json(
      { data: null, error: insertError?.message ?? 'Errore voto sondaggio' },
      { status: 500 },
    )
  }

  return NextResponse.json({ data: { vote }, error: null }, { status: 201 })
}

// DELETE /api/posts/:id/poll/vote?option_id=... → 200 { removed: number }
//
// Se option_id è presente: rimuove solo quel voto (utile per multi-choice).
// Se option_id è assente: rimuove TUTTI i voti del membro per il sondaggio
// (ritira il voto in single-choice).
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()
  if (member instanceof NextResponse) return member

  const { id: post_id } = await params
  const option_id = new URL(req.url).searchParams.get('option_id')

  const db = createServerClient()

  const { data: poll, error: pollError } = await db
    .from('post_polls')
    .select('id, closes_at')
    .eq('post_id', post_id)
    .maybeSingle()

  if (pollError) {
    return NextResponse.json({ data: null, error: pollError.message }, { status: 500 })
  }
  if (!poll) {
    return NextResponse.json({ data: null, error: 'Sondaggio non trovato' }, { status: 404 })
  }

  if (poll.closes_at && new Date(poll.closes_at).getTime() < Date.now()) {
    return NextResponse.json({ data: null, error: 'Il sondaggio è chiuso' }, { status: 403 })
  }

  let query = db
    .from('post_poll_votes')
    .delete({ count: 'exact' })
    .eq('poll_id', poll.id)
    .eq('member_id', member.id)

  if (option_id) {
    query = query.eq('option_id', option_id)
  }

  const { count, error: deleteError } = await query

  if (deleteError) {
    return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { removed: count ?? 0 }, error: null })
}
