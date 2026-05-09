import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'
import {
  ActivityWeeklyStatus,
  SetWeeklyStatusInput,
  ApiResponse,
} from '@/types/database'

function getWeekStartFromString(weekStartParam: string | null): string {
  if (weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
    return weekStartParam
  }
  const today = new Date()
  const dayOfWeek = today.getDay()
  const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  const y = monday.getFullYear()
  const m = monday.getMonth()
  const d = monday.getDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<ActivityWeeklyStatus | null>>> {
  let currentMember
  try {
    currentMember = await requireAuth()
  } catch (res) {
    return res as NextResponse<ApiResponse<ActivityWeeklyStatus | null>>
  }

  const { id } = await params
  const db = createServerClient()

  let body: SetWeeklyStatusInput & { week_start?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Corpo della richiesta non valido' }, { status: 400 })
  }

  const { status, modified_notes, week_start: weekStartParam } = body
  const weekStart = getWeekStartFromString(weekStartParam ?? null)

  if (!status) {
    return NextResponse.json({ data: null, error: 'Il campo status è obbligatorio' }, { status: 400 })
  }

  // Fetch activity to ensure it exists and get its title
  const { data: activity, error: activityError } = await db
    .from('activities')
    .select('id, title')
    .eq('id', id)
    .single()

  if (activityError || !activity) {
    return NextResponse.json({ data: null, error: 'Attività non trovata' }, { status: 404 })
  }

  // If status='pending' → DELETE the weekly_status record (reset)
  if (status === 'pending') {
    const { error: deleteError } = await db
      .from('activity_weekly_status')
      .delete()
      .eq('activity_id', id)
      .eq('week_start', weekStart)

    if (deleteError) {
      return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ data: null, error: null })
  }

  // Otherwise → upsert with onConflict: 'activity_id,week_start'
  const { data: upserted, error: upsertError } = await db
    .from('activity_weekly_status')
    .upsert(
      {
        activity_id: id,
        week_start: weekStart,
        status,
        confirmed_by: currentMember.id,
        modified_notes: modified_notes ?? null,
      },
      { onConflict: 'activity_id,week_start' }
    )
    .select()
    .single()

  if (upsertError || !upserted) {
    return NextResponse.json({ data: null, error: upsertError?.message ?? 'Errore upsert' }, { status: 500 })
  }

  // Notify participants on status change
  const { data: participantsData } = await db
    .from('activity_participants')
    .select('member_id')
    .eq('activity_id', id)

  const participantIds = (participantsData ?? [])
    .map((row) => row.member_id as string)
    .filter((mid) => mid !== currentMember.id)

  if (participantIds.length > 0) {
    const statusLabels: Record<string, string> = {
      confirmed: 'confermata',
      skipped: 'saltata',
      modified: 'modificata',
    }
    const statusLabel = statusLabels[status] ?? status
    const notifyBody = modified_notes
      ? `${activity.title} è ${statusLabel}: ${modified_notes}`
      : `${activity.title} è ${statusLabel} per questa settimana`

    await notifyMembers(
      participantIds,
      'activity_reminder',
      `Attività ${statusLabel}`,
      notifyBody,
      `/activities/${id}`
    ).catch((err) => console.error('notifyMembers error:', err))
  }

  return NextResponse.json({ data: upserted as ActivityWeeklyStatus, error: null })
}
