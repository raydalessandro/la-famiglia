import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { hashPin, createSession, toPublicMember } from '@/lib/auth'
import { SetupInput } from '@/types/database'

// GET /api/setup — check if setup is done
export async function GET() {
  const db = createServerClient()

  const { data } = await db
    .from('members')
    .select('id')
    .eq('is_admin', true)
    .eq('is_active', true)
    .limit(1)
    .single()

  return NextResponse.json({ data: { setup_completed: data !== null }, error: null }, { status: 200 })
}

// POST /api/setup — create first admin member
export async function POST(request: NextRequest) {
  const db = createServerClient()

  // 1. Check no admin exists already
  const { data: existingAdmin } = await db
    .from('members')
    .select('id')
    .eq('is_admin', true)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (existingAdmin !== null) {
    return NextResponse.json({ data: null, error: 'Setup già completato' }, { status: 400 })
  }

  // 2. Parse and validate body
  let body: Partial<SetupInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Corpo della richiesta non valido' }, { status: 400 })
  }

  const { name, pin, avatar_emoji, family_role } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ data: null, error: 'Nome obbligatorio' }, { status: 400 })
  }

  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ data: null, error: 'PIN deve essere di 4 cifre numeriche' }, { status: 400 })
  }

  // 3. Hash the PIN
  const pin_hash = hashPin(pin)

  // 4. Insert new admin member with defaults
  const { data: newMember, error: insertError } = await db
    .from('members')
    .insert({
      name: name.trim(),
      pin_hash,
      is_admin: true,
      is_active: true,
      avatar_emoji: avatar_emoji ?? null,
      family_role: family_role ?? 'Membro',
      bio: '',
      color: '#6366f1',
      notify_push: false,
      notify_telegram: false,
      telegram_chat_id: null,
    })
    .select('*')
    .single()

  if (insertError || !newMember) {
    return NextResponse.json({ data: null, error: 'Errore durante la creazione del membro' }, { status: 500 })
  }

  // 5. Create session
  await createSession(newMember.id)

  // 6. Return public member
  const memberPublic = toPublicMember(newMember)

  return NextResponse.json({ data: { member: memberPublic }, error: null }, { status: 200 })
}
