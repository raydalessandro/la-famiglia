import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'
import { EventAttendance, SetEventAttendanceInput } from '@/types/database'

const VALID_STATUSES = ['confirmed', 'skipped', 'modified'] as const
type Status = typeof VALID_STATUSES[number]

function isValidStatus(s: unknown): s is Status {
  return typeof s === 'string' && (VALID_STATUSES as readonly string[]).includes(s)
}

// POST /api/events/:id/attendance — upsert MY attendance for this event.
// Mirror di /api/activities/:id/attendance ma senza week_start (gli eventi
// sono one-off). Tutti i membri loggati possono confermare/saltare/modificare:
// l'app è "di famiglia", niente gate su roster pre-selezionato.
//
// Body: SetEventAttendanceInput { status, modified_notes? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentMember = await requireAuth()
  if (currentMember instanceof NextResponse) return currentMember

  const { id } = await params
  const db = createServerClient()

  let body: Partial<SetEventAttendanceInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Corpo della richiesta non valido' }, { status: 400 })
  }

  if (!isValidStatus(body.status)) {
    return NextResponse.json({ data: null, error: 'Status non valido' }, { status: 400 })
  }

  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, event_date, created_by')
    .eq('id', id)
    .single()

  if (eventError || !event) {
    return NextResponse.json({ data: null, error: 'Evento non trovato' }, { status: 404 })
  }

  // Destinatari della notifica: chi ha gia` risposto (status NOT NULL) +
  // l'organizzatore dell'evento, escluso il membro corrente. Niente roster
  // pre-selezionato — coerente col modello "tutti possono rispondere".
  const { data: previousResponders } = await db
    .from('event_participants')
    .select('member_id')
    .eq('event_id', id)
    .not('status', 'is', null)

  const notifyCandidates = new Set<string>()
  for (const row of previousResponders ?? []) {
    notifyCandidates.add(row.member_id as string)
  }
  if (event.created_by) notifyCandidates.add(event.created_by as string)
  notifyCandidates.delete(currentMember.id)

  const { data: upserted, error: upsertError } = await db
    .from('event_participants')
    .upsert(
      {
        event_id: id,
        member_id: currentMember.id,
        status: body.status,
        modified_notes: body.modified_notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,member_id' }
    )
    .select()
    .single()

  if (upsertError || !upserted) {
    return NextResponse.json({ data: null, error: upsertError?.message ?? 'Errore upsert' }, { status: 500 })
  }

  const notifyTargets = Array.from(notifyCandidates)
  if (notifyTargets.length > 0) {
    const labels: Record<Status, string> = {
      confirmed: 'ha confermato',
      skipped: 'salterà',
      modified: 'ha modificato',
    }
    const action = labels[body.status]
    const notifyBody = body.modified_notes
      ? `${currentMember.name} ${action} ${event.title}: ${body.modified_notes}`
      : `${currentMember.name} ${action} ${event.title}`

    notifyMembers(
      notifyTargets,
      'activity_reminder',
      `Aggiornamento ${event.title}`,
      notifyBody,
      `/activities`
    ).catch((err) => console.error('notifyMembers error:', err))
  }

  return NextResponse.json({ data: upserted as EventAttendance, error: null })
}

// DELETE /api/events/:id/attendance — clear MY attendance for this event.
// Idempotente: se non esiste riga, nessun errore.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentMember = await requireAuth()
  if (currentMember instanceof NextResponse) return currentMember

  const { id } = await params
  const db = createServerClient()

  const { error: deleteError } = await db
    .from('event_participants')
    .delete()
    .eq('event_id', id)
    .eq('member_id', currentMember.id)

  if (deleteError) {
    return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ data: null, error: null })
}
