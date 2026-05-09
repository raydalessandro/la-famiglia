import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin, hashPin, toPublicMember } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { CreateMemberInput } from '@/types/database'

// GET /api/members → ApiResponse<MemberPublic[]>
// Returns all active members ordered by name
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  try {
    await requireAuth()
  } catch (response) {
    return response as Response
  }

  const db = createServerClient()
  const { data: members, error } = await db
    .from('members')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  const publicMembers = (members ?? []).map(toPublicMember)
  return NextResponse.json({ data: publicMembers, error: null })
}

// POST /api/members (admin only) → 201 ApiResponse<MemberPublic>
// Body: CreateMemberInput { name, avatar_emoji?, family_role, pin, bio?, color?, is_admin? }
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch (response) {
    return response as Response
  }

  let body: CreateMemberInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const { name, avatar_emoji, family_role, pin, bio, color, is_admin } = body

  if (!name || name.trim() === '') {
    return NextResponse.json({ data: null, error: 'Il nome è obbligatorio' }, { status: 400 })
  }

  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ data: null, error: 'Il PIN deve essere di 4 cifre' }, { status: 400 })
  }

  const pin_hash = hashPin(pin)

  const db = createServerClient()
  const { data: member, error } = await db
    .from('members')
    .insert({
      name: name.trim(),
      avatar_emoji: avatar_emoji ?? null,
      family_role: family_role ?? '',
      pin_hash,
      bio: bio ?? '',
      color: color ?? '#000000',
      is_admin: is_admin ?? false,
      is_active: true,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: toPublicMember(member), error: null }, { status: 201 })
}
