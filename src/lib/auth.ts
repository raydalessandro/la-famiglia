import { createServerClient } from './supabase/client'
import { Member, MemberPublic } from '../types/database'
import crypto from 'crypto'
import { cookies } from 'next/headers'

const SESSION_COOKIE_NAME = 'famiglia_session'
const SESSION_DURATION_DAYS = 30
const PIN_SALT = 'famiglia_salt_2026'

export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(PIN_SALT + pin).digest('hex')
}

export function verifyPin(pin: string, hash: string): boolean {
  return hashPin(pin) === hash
}

export async function createSession(memberId: string): Promise<string> {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)

  const db = createServerClient()
  await db.from('sessions').insert({
    member_id: memberId,
    token,
    expires_at: expiresAt.toISOString(),
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  })

  return token
}

export async function validateSession(): Promise<Member | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (!cookie) {
    return null
  }

  const token = cookie.value
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('*')
    .eq('token', token)
    .single()

  if (!session) {
    return null
  }

  if (new Date(session.expires_at) < new Date()) {
    await db.from('sessions').delete().eq('token', token)
    return null
  }

  const { data: member } = await db
    .from('members')
    .select('*')
    .eq('id', session.member_id)
    .eq('is_active', true)
    .single()

  if (!member) {
    return null
  }

  return member as Member
}

export async function getCurrentMember(): Promise<MemberPublic | null> {
  const member = await validateSession()
  if (!member) {
    return null
  }
  return toPublicMember(member)
}

export async function requireAuth(): Promise<Member> {
  const member = await validateSession()
  if (!member) {
    throw new Response(JSON.stringify({ data: null, error: 'Non autenticato' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return member
}

export async function requireAdmin(): Promise<Member> {
  const member = await requireAuth()
  if (!member.is_admin) {
    throw new Response(JSON.stringify({ data: null, error: 'Accesso negato' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return member
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (!cookie) {
    return
  }

  const token = cookie.value
  const db = createServerClient()
  await db.from('sessions').delete().eq('token', token)

  cookieStore.delete(SESSION_COOKIE_NAME)
}

export function toPublicMember(member: Member): MemberPublic {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pin_hash, notify_push, notify_telegram, telegram_chat_id, created_at, updated_at, ...publicMember } = member
  return publicMember as MemberPublic
}
