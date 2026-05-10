import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'
import { getWeekStart } from '@/lib/dates'
import { ActivityAttendance, SetAttendanceInput } from '@/types/database'

const VALID_STATUSES = ['confirmed', 'skipped', 'modified'] as const
type Status = typeof VALID_STATUSES[number]

function isValidStatus(s: unknown): s is Status {
  return typeof s === 'string' && (VALID_STATUSES as readonly string[]).includes(s)
}

// POST /api/activities/:id/attendance — upsert MY attendance for the given week.
// Body: SetAttendanceInput { week_start, status, modified_notes? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentMember = await requireAuth()
  if (currentMember instanceof NextResponse) return currentMember

  const { id } = await params
  const db = createServerClient()

  let body: Partial<SetAttendanceInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Corpo della richiesta non valido' }, { status: 400 })
  }

  const weekStart = getWeekStart(body.week_start ?? null)

  if (!isValidStatus(body.status)) {
    return NextResponse.json({ data: null, error: 'Status non valido' }, { status: 400 })
  }

  const { data: activity, error: activityError } = await db
    .from('activities')
    .select('id, title')
    .eq('id', id)
    .single()

  if (activityError || !activity) {
    return NextResponse.json({ data: null, error: 'Attività non trovata' }, { status: 404 })
  }

  // Authorization: only participants OR admin can mark attendance.
  const { data: participantsForAuth } = await db
    .from('activity_participants')
    .select('member_id')
    .eq('activity_id', id)

  const participantIds = (participantsForAuth ?? []).map((row) => row.member_id as string)
  const isParticipant = participantIds.includes(currentMember.id)

  if (!isParticipant && !currentMember.is_admin) {
    return NextResponse.json(
      { data: null, error: 'Non sei partecipante di questa attività' },
      { status: 403 }
    )
  }

  const { data: upserted, error: upsertError } = await db
    .from('activity_weekly_attendances')
    .upsert(
      {
        activity_id: id,
        week_start: weekStart,
        member_id: currentMember.id,
        status: body.status,
        modified_notes: body.modified_notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'activity_id,week_start,member_id' }
    )
    .select()
    .single()

  if (upsertError || !upserted) {
    return NextResponse.json({ data: null, error: upsertError?.message ?? 'Errore upsert' }, { status: 500 })
  }

  // Notify the other participants (best-effort, never blocks the response).
  const notifyTargets = participantIds.filter((mid) => mid !== currentMember.id)
  if (notifyTargets.length > 0) {
    const labels: Record<Status, string> = {
      confirmed: 'ha confermato',
      skipped: 'salterà',
      modified: 'ha modificato',
    }
    const action = labels[body.status]
    const notifyBody = body.modified_notes
      ? `${currentMember.name} ${action} ${activity.title}: ${body.modified_notes}`
      : `${currentMember.name} ${action} ${activity.title}`

    notifyMembers(
      notifyTargets,
      'activity_reminder',
      `Aggiornamento ${activity.title}`,
      notifyBody,
      `/activities`
    ).catch((err) => console.error('notifyMembers error:', err))
  }

  return NextResponse.json({ data: upserted as ActivityAttendance, error: null })
}

// DELETE /api/activities/:id/attendance?week_start=YYYY-MM-DD — clear MY attendance.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentMember = await requireAuth()
  if (currentMember instanceof NextResponse) return currentMember

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const weekStart = getWeekStart(searchParams.get('week_start'))

  const db = createServerClient()

  const { error: deleteError } = await db
    .from('activity_weekly_attendances')
    .delete()
    .eq('activity_id', id)
    .eq('week_start', weekStart)
    .eq('member_id', currentMember.id)

  if (deleteError) {
    return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ data: null, error: null })
}
