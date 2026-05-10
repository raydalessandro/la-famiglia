import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { verifyPin, createSession, deleteSession, getCurrentMember, toPublicMember, rehashPinIfNeeded } from '@/lib/auth'
import { LoginInput } from '@/types/database'

// POST /api/auth — login
export async function POST(request: NextRequest) {
  let body: Partial<LoginInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Corpo della richiesta non valido' }, { status: 400 })
  }

  const { member_id, pin } = body

  if (!member_id || typeof member_id !== 'string' || member_id.trim() === '') {
    return NextResponse.json({ data: null, error: 'member_id obbligatorio' }, { status: 400 })
  }

  if (!pin || typeof pin !== 'string' || pin.length !== 4) {
    return NextResponse.json({ data: null, error: 'PIN deve essere di 4 caratteri' }, { status: 400 })
  }

  const db = createServerClient()

  const { data: member } = await db
    .from('members')
    .select('*')
    .eq('id', member_id.trim())
    .eq('is_active', true)
    .single()

  if (!member) {
    return NextResponse.json({ data: null, error: 'PIN non valido' }, { status: 401 })
  }

  const valid = verifyPin(pin, member.pin_hash)
  if (!valid) {
    return NextResponse.json({ data: null, error: 'PIN non valido' }, { status: 401 })
  }

  await rehashPinIfNeeded(member.id, pin, member.pin_hash)

  const token = await createSession(member.id)
  const memberPublic = toPublicMember(member)

  return NextResponse.json({ data: { member: memberPublic, token }, error: null }, { status: 200 })
}

// DELETE /api/auth — logout
export async function DELETE() {
  await deleteSession()
  return NextResponse.json({ data: null, error: null }, { status: 200 })
}

// GET /api/auth — check session
export async function GET() {
  const member = await getCurrentMember()

  if (!member) {
    return NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
  }

  return NextResponse.json({ data: { member }, error: null }, { status: 200 })
}
