import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { getWeekStart } from '@/lib/dates'
import { ActivityWithDetails, CreateActivityInput, MemberPublic, ActivityAttendance } from '@/types/database'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()

  if (auth instanceof NextResponse) return auth

  const db = createServerClient()
  const { searchParams } = new URL(request.url)
  const weekStart = getWeekStart(searchParams.get('week_start'))

  const { data: activities, error: activitiesError } = await db
    .from('activities')
    .select('*')
    .eq('is_active', true)
    .order('day_of_week', { ascending: true })
    .order('time', { ascending: true })

  if (activitiesError) {
    return NextResponse.json({ data: null, error: activitiesError.message }, { status: 500 })
  }

  if (!activities || activities.length === 0) {
    return NextResponse.json({ data: [], error: null })
  }

  const activityIds = activities.map((a) => a.id)

  const [participantsRes, rolesRes, attendancesRes] = await Promise.all([
    db
      .from('activity_participants')
      .select('activity_id, member_id, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
      .in('activity_id', activityIds),
    db
      .from('activity_roles')
      .select('id, activity_id, member_id, role_label, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
      .in('activity_id', activityIds),
    db
      .from('activity_weekly_attendances')
      .select('*')
      .in('activity_id', activityIds)
      .eq('week_start', weekStart),
  ])

  if (participantsRes.error) {
    return NextResponse.json({ data: null, error: participantsRes.error.message }, { status: 500 })
  }
  if (rolesRes.error) {
    return NextResponse.json({ data: null, error: rolesRes.error.message }, { status: 500 })
  }
  if (attendancesRes.error) {
    return NextResponse.json({ data: null, error: attendancesRes.error.message }, { status: 500 })
  }

  const participantsByActivity: Record<string, MemberPublic[]> = {}
  for (const row of participantsRes.data ?? []) {
    const m = row.members as unknown as MemberPublic | null
    if (!m) continue
    if (!participantsByActivity[row.activity_id]) participantsByActivity[row.activity_id] = []
    participantsByActivity[row.activity_id].push(m)
  }

  const rolesByActivity: Record<string, ActivityWithDetails['roles']> = {}
  for (const row of rolesRes.data ?? []) {
    const m = row.members as unknown as MemberPublic | null
    if (!rolesByActivity[row.activity_id]) rolesByActivity[row.activity_id] = []
    rolesByActivity[row.activity_id].push({
      id: row.id,
      activity_id: row.activity_id,
      member_id: row.member_id,
      role_label: row.role_label,
      member: m ?? undefined,
    })
  }

  const attendancesByActivity: Record<string, ActivityAttendance[]> = {}
  for (const row of (attendancesRes.data ?? []) as ActivityAttendance[]) {
    if (!attendancesByActivity[row.activity_id]) attendancesByActivity[row.activity_id] = []
    attendancesByActivity[row.activity_id].push(row)
  }

  const result: ActivityWithDetails[] = activities.map((activity) => ({
    ...activity,
    participants: participantsByActivity[activity.id] ?? [],
    roles: rolesByActivity[activity.id] ?? [],
    attendances: attendancesByActivity[activity.id] ?? [],
    weekly_status: null,
  }))

  return NextResponse.json({ data: result, error: null })
}

export async function POST(request: NextRequest) {
  const currentMember = await requireAuth()

  if (currentMember instanceof NextResponse) return currentMember

  const db = createServerClient()
  let body: CreateActivityInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Corpo della richiesta non valido' }, { status: 400 })
  }

  const { title, icon, color, day_of_week, time, location, notes, participant_ids, roles } = body

  if (!title || day_of_week === undefined || !time) {
    return NextResponse.json({ data: null, error: 'Campi obbligatori mancanti: title, day_of_week, time' }, { status: 400 })
  }

  const { data: activity, error: activityError } = await db
    .from('activities')
    .insert({
      title,
      icon: icon ?? '📅',
      color: color ?? '#6366f1',
      day_of_week,
      time,
      location: location ?? '',
      notes: notes ?? '',
      is_active: true,
      created_by: currentMember.id,
    })
    .select()
    .single()

  if (activityError || !activity) {
    return NextResponse.json({ data: null, error: activityError?.message ?? 'Errore nella creazione' }, { status: 500 })
  }

  // Insert participants
  if (participant_ids && participant_ids.length > 0) {
    const { error: partError } = await db
      .from('activity_participants')
      .insert(participant_ids.map((mid) => ({ activity_id: activity.id, member_id: mid })))
    if (partError) {
      return NextResponse.json({ data: null, error: partError.message }, { status: 500 })
    }
  }

  // Insert roles
  if (roles && roles.length > 0) {
    const { error: rolesError } = await db
      .from('activity_roles')
      .insert(roles.map((r) => ({ activity_id: activity.id, member_id: r.member_id, role_label: r.role_label })))
    if (rolesError) {
      return NextResponse.json({ data: null, error: rolesError.message }, { status: 500 })
    }
  }

  // Fetch participants with member details
  const { data: participantsData } = await db
    .from('activity_participants')
    .select('member_id, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('activity_id', activity.id)

  const participants: MemberPublic[] = (participantsData ?? [])
    .map((row) => row.members as unknown as MemberPublic | null)
    .filter((m): m is MemberPublic => m !== null)

  // Fetch roles with member details
  const { data: rolesData } = await db
    .from('activity_roles')
    .select('id, activity_id, member_id, role_label, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('activity_id', activity.id)

  const activityRoles = (rolesData ?? []).map((row) => ({
    id: row.id,
    activity_id: row.activity_id,
    member_id: row.member_id,
    role_label: row.role_label,
    member: (row.members as unknown as MemberPublic | null) ?? undefined,
  }))

  const result: ActivityWithDetails = {
    ...activity,
    participants,
    roles: activityRoles,
    attendances: [],
    weekly_status: null,
  }

  return NextResponse.json({ data: result, error: null }, { status: 201 })
}
