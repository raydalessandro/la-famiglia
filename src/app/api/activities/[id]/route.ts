import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { getWeekStart } from '@/lib/dates'
import {
  ActivityWithDetails,
  UpdateActivityInput,
  ApiResponse,
  MemberPublic,
} from '@/types/database'

async function fetchActivityWithDetails(
  db: ReturnType<typeof createServerClient>,
  activityId: string,
  weekStart: string
): Promise<ActivityWithDetails | null> {
  const { data: activity, error: activityError } = await db
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .single()

  if (activityError || !activity) return null

  const [participantsRes, rolesRes, statusRes] = await Promise.all([
    db
      .from('activity_participants')
      .select('member_id, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
      .eq('activity_id', activityId),
    db
      .from('activity_roles')
      .select('id, activity_id, member_id, role_label, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
      .eq('activity_id', activityId),
    db
      .from('activity_weekly_status')
      .select('*')
      .eq('activity_id', activityId)
      .eq('week_start', weekStart)
      .maybeSingle(),
  ])

  const participants: MemberPublic[] = (participantsRes.data ?? [])
    .map((row) => row.members as unknown as MemberPublic | null)
    .filter((m): m is MemberPublic => m !== null)

  const roles = (rolesRes.data ?? []).map((row) => ({
    id: row.id,
    activity_id: row.activity_id,
    member_id: row.member_id,
    role_label: row.role_label,
    member: (row.members as unknown as MemberPublic | null) ?? undefined,
  }))

  return {
    ...activity,
    participants,
    roles,
    weekly_status: statusRes.data ?? null,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<ActivityWithDetails>>> {
  try {
    await requireAuth()
  } catch (res) {
    return res as NextResponse<ApiResponse<ActivityWithDetails>>
  }

  const { id } = await params
  const db = createServerClient()
  const { searchParams } = new URL(request.url)
  const weekStart = getWeekStart(searchParams.get('week_start'))

  const result = await fetchActivityWithDetails(db, id, weekStart)

  if (!result) {
    return NextResponse.json({ data: null, error: 'Attività non trovata' }, { status: 404 })
  }

  return NextResponse.json({ data: result, error: null })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<ActivityWithDetails>>> {
  let currentMember
  try {
    currentMember = await requireAuth()
  } catch (res) {
    return res as NextResponse<ApiResponse<ActivityWithDetails>>
  }

  const { id } = await params
  const db = createServerClient()

  // Authorization: only the creator OR an admin can modify an activity.
  const { data: existing, error: existingError } = await db
    .from('activities')
    .select('id, created_by')
    .eq('id', id)
    .single()

  if (existingError || !existing) {
    return NextResponse.json({ data: null, error: 'Attività non trovata' }, { status: 404 })
  }

  if (existing.created_by !== currentMember.id && !currentMember.is_admin) {
    return NextResponse.json(
      { data: null, error: 'Non autorizzato a modificare questa attività' },
      { status: 403 }
    )
  }

  let body: UpdateActivityInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Corpo della richiesta non valido' }, { status: 400 })
  }

  const { participant_ids, roles, ...activityFields } = body

  // Update activity fields if any
  if (Object.keys(activityFields).length > 0) {
    const { error: updateError } = await db
      .from('activities')
      .update(activityFields)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ data: null, error: updateError.message }, { status: 500 })
    }
  }

  // Replace participants if provided
  if (participant_ids !== undefined) {
    const { error: deleteError } = await db
      .from('activity_participants')
      .delete()
      .eq('activity_id', id)

    if (deleteError) {
      return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
    }

    if (participant_ids.length > 0) {
      const { error: insertError } = await db
        .from('activity_participants')
        .insert(participant_ids.map((mid) => ({ activity_id: id, member_id: mid })))

      if (insertError) {
        return NextResponse.json({ data: null, error: insertError.message }, { status: 500 })
      }
    }
  }

  // Replace roles if provided
  if (roles !== undefined) {
    const { error: deleteError } = await db
      .from('activity_roles')
      .delete()
      .eq('activity_id', id)

    if (deleteError) {
      return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
    }

    if (roles.length > 0) {
      const { error: insertError } = await db
        .from('activity_roles')
        .insert(roles.map((r) => ({ activity_id: id, member_id: r.member_id, role_label: r.role_label })))

      if (insertError) {
        return NextResponse.json({ data: null, error: insertError.message }, { status: 500 })
      }
    }
  }

  const { searchParams } = new URL(request.url)
  const weekStart = getWeekStart(searchParams.get('week_start'))
  const result = await fetchActivityWithDetails(db, id, weekStart)

  if (!result) {
    return NextResponse.json({ data: null, error: 'Attività non trovata' }, { status: 404 })
  }

  return NextResponse.json({ data: result, error: null })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<null>>> {
  let currentMember
  try {
    currentMember = await requireAuth()
  } catch (res) {
    return res as NextResponse<ApiResponse<null>>
  }

  const { id } = await params
  const db = createServerClient()

  // Authorization: only the creator OR an admin can delete an activity.
  const { data: existing, error: existingError } = await db
    .from('activities')
    .select('id, created_by')
    .eq('id', id)
    .single()

  if (existingError || !existing) {
    return NextResponse.json({ data: null, error: 'Attività non trovata' }, { status: 404 })
  }

  if (existing.created_by !== currentMember.id && !currentMember.is_admin) {
    return NextResponse.json(
      { data: null, error: 'Non autorizzato a eliminare questa attività' },
      { status: 403 }
    )
  }

  const { error } = await db
    .from('activities')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: null, error: null })
}
