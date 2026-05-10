import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin, hashPin, verifyPin, toPublicMember } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { UpdateMemberInput } from '@/types/database'

type RouteContext = { params: Promise<{ id: string }> }

// Fields a non-admin member is allowed to update on themselves
const NON_ADMIN_ALLOWED_FIELDS: (keyof UpdateMemberInput | 'new_pin')[] = [
  'bio',
  'avatar_emoji',
  'avatar_url',
  'color',
  'notify_push',
  'notify_telegram',
  'telegram_chat_id',
  'new_pin',
]

// GET /api/members/:id → ApiResponse<MemberPublic>
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()

  if (auth instanceof NextResponse) return auth

  const { id } = await params

  const db = createServerClient()
  const { data: member, error } = await db
    .from('members')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (error || !member) {
    return NextResponse.json({ data: null, error: 'Membro non trovato' }, { status: 404 })
  }

  return NextResponse.json({ data: toPublicMember(member), error: null })
}

// PATCH /api/members/:id (admin or self) → ApiResponse<MemberPublic>
// Body: UpdateMemberInput & { new_pin?: string }
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const currentMember = await requireAuth()

  if (currentMember instanceof NextResponse) return currentMember

  const { id } = await params
  const isAdmin = currentMember.is_admin
  const isSelf = currentMember.id === id

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
  }

  let body: UpdateMemberInput & { new_pin?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  // Non-admins can only update their own allowed fields
  let updatePayload: Record<string, unknown> = {}

  if (isAdmin) {
    // Admin can update any field (except new_pin/current_pin which are handled separately)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { new_pin, current_pin, ...rest } = body as Record<string, unknown>
    updatePayload = { ...rest }

    if (new_pin !== undefined) {
      if (!/^\d{4}$/.test(new_pin as string)) {
        return NextResponse.json({ data: null, error: 'Il nuovo PIN deve essere di 4 cifre' }, { status: 400 })
      }
      updatePayload.pin_hash = hashPin(new_pin as string)
    }
  } else {
    // Non-admin: strip disallowed fields, only keep allowed ones
    const bodyAny = body as Record<string, unknown>
    for (const field of NON_ADMIN_ALLOWED_FIELDS) {
      if (field === 'new_pin') {
        if (body.new_pin !== undefined) {
          if (!/^\d{4}$/.test(body.new_pin)) {
            return NextResponse.json({ data: null, error: 'Il nuovo PIN deve essere di 4 cifre' }, { status: 400 })
          }
          // Validate current PIN before allowing change
          const currentPin = bodyAny.current_pin as string | undefined
          if (!currentPin) {
            return NextResponse.json({ data: null, error: 'PIN attuale obbligatorio' }, { status: 400 })
          }
          if (!verifyPin(currentPin, currentMember.pin_hash)) {
            return NextResponse.json({ data: null, error: 'PIN attuale non corretto' }, { status: 403 })
          }
          updatePayload.pin_hash = hashPin(body.new_pin)
        }
      } else if (body[field as keyof UpdateMemberInput] !== undefined) {
        updatePayload[field] = body[field as keyof UpdateMemberInput]
      }
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ data: null, error: 'Nessun campo da aggiornare' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: updated, error } = await db
    .from('members')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !updated) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Aggiornamento fallito' }, { status: 500 })
  }

  return NextResponse.json({ data: toPublicMember(updated), error: null })
}

// DELETE /api/members/:id (admin only) → ApiResponse<null>
// Soft delete: sets is_active = false. Cannot delete self.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const currentMember = await requireAdmin()

  if (currentMember instanceof NextResponse) return currentMember

  const { id } = await params

  if (currentMember.id === id) {
    return NextResponse.json(
      { data: null, error: 'Non puoi disattivare te stesso' },
      { status: 400 }
    )
  }

  const db = createServerClient()
  const { data: updated, error } = await db
    .from('members')
    .update({ is_active: false })
    .eq('id', id)
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ data: null, error: 'Membro non trovato' }, { status: 404 })
  }

  return NextResponse.json({ data: null, error: null })
}
