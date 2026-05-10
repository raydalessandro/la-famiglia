import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { ActivityRole, MemberPublic } from '@/types/database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()

  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const db = createServerClient()

  const { data: rolesData, error: rolesError } = await db
    .from('activity_roles')
    .select('id, activity_id, member_id, role_label, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('activity_id', id)

  if (rolesError) {
    return NextResponse.json({ data: null, error: rolesError.message }, { status: 500 })
  }

  const roles: ActivityRole[] = (rolesData ?? []).map((row) => ({
    id: row.id,
    activity_id: row.activity_id,
    member_id: row.member_id,
    role_label: row.role_label,
    member: (row.members as unknown as MemberPublic | null) ?? undefined,
  }))

  return NextResponse.json({ data: roles, error: null })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentMember = await requireAuth()

  if (currentMember instanceof NextResponse) return currentMember

  const { id } = await params
  const db = createServerClient()

  // Authorization: editing roles is part of editing the activity, so only
  // the creator OR an admin can perform this action.
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
      { data: null, error: 'Non autorizzato a modificare i ruoli di questa attività' },
      { status: 403 }
    )
  }

  let body: { roles: { member_id: string; role_label: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Corpo della richiesta non valido' }, { status: 400 })
  }

  const { roles } = body

  if (!Array.isArray(roles)) {
    return NextResponse.json({ data: null, error: 'Il campo roles deve essere un array' }, { status: 400 })
  }

  // Replace-all pattern: DELETE all old → INSERT new
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

  // Fetch updated roles with member details
  const { data: rolesData, error: fetchError } = await db
    .from('activity_roles')
    .select('id, activity_id, member_id, role_label, members(id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color)')
    .eq('activity_id', id)

  if (fetchError) {
    return NextResponse.json({ data: null, error: fetchError.message }, { status: 500 })
  }

  const result: ActivityRole[] = (rolesData ?? []).map((row) => ({
    id: row.id,
    activity_id: row.activity_id,
    member_id: row.member_id,
    role_label: row.role_label,
    member: (row.members as unknown as MemberPublic | null) ?? undefined,
  }))

  return NextResponse.json({ data: result, error: null })
}
