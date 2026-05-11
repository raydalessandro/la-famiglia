import { createServerClient } from './supabase/client'
import { Member, MemberPublic, MemberSelf } from '../types/database'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const SESSION_COOKIE_NAME = 'famiglia_session'
export const SESSION_DURATION_DAYS = 30

// Legacy salt — kept only to verify pre-bcrypt hashes during transparent rehash.
const LEGACY_PIN_SALT = 'famiglia_salt_2026'
const BCRYPT_ROUNDS = 12

function hashPinLegacy(pin: string): string {
  return crypto.createHash('sha256').update(LEGACY_PIN_SALT + pin).digest('hex')
}

function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash)
}

export function needsRehash(hash: string): boolean {
  return !isBcryptHash(hash)
}

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, BCRYPT_ROUNDS)
}

export function verifyPin(pin: string, hash: string): boolean {
  if (isBcryptHash(hash)) return bcrypt.compareSync(pin, hash)
  return hashPinLegacy(pin) === hash
}

export async function rehashPinIfNeeded(memberId: string, pin: string, currentHash: string): Promise<void> {
  if (!needsRehash(currentHash)) return
  const newHash = hashPin(pin)
  const db = createServerClient()
  await db.from('members').update({ pin_hash: newHash }).eq('id', memberId)
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

// In-memory cache of validated sessions to avoid re-querying the DB on every
// API call within a short window. Module-scoped so it persists across requests
// in the same Node instance. TTL kept short so logouts and PIN changes propagate
// quickly enough for a small family-scale deployment.
const SESSION_CACHE_TTL_MS = 30_000
type CachedSession = { member: Member; expiresAt: number }
const sessionCache = new Map<string, CachedSession>()

export function clearSessionCache(token?: string): void {
  if (token) sessionCache.delete(token)
  else sessionCache.clear()
}

export async function validateSession(): Promise<Member | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)
  if (!cookie) return null

  const token = cookie.value
  const now = Date.now()

  const cached = sessionCache.get(token)
  if (cached && cached.expiresAt > now) {
    return cached.member
  }
  if (cached) sessionCache.delete(token)

  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('*')
    .eq('token', token)
    .single()

  if (!session) return null

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

  if (!member) return null

  sessionCache.set(token, { member: member as Member, expiresAt: now + SESSION_CACHE_TTL_MS })
  return member as Member
}

export async function getCurrentMember(): Promise<MemberPublic | null> {
  const member = await validateSession()
  if (!member) {
    return null
  }
  return toPublicMember(member)
}

export async function requireAuth(): Promise<Member | NextResponse> {
  const member = await validateSession()
  if (!member) {
    return NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
  }
  return member
}

export async function requireAdmin(): Promise<Member | NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  if (!auth.is_admin) {
    return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
  }
  return auth
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (!cookie) {
    return
  }

  const token = cookie.value
  clearSessionCache(token)
  const db = createServerClient()
  await db.from('sessions').delete().eq('token', token)

  cookieStore.delete(SESSION_COOKIE_NAME)
}

export function toPublicMember(member: Member): MemberPublic {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pin_hash, notify_push, notify_telegram, telegram_chat_id, created_at, updated_at, ...publicMember } = member
  return publicMember as MemberPublic
}

/**
 * Variante self/admin: mantiene le preferenze di notifica (notify_push,
 * notify_telegram, telegram_chat_id) che `toPublicMember` strippa per
 * privacy. Usato dalle API quando il caller è il proprietario del
 * record o un admin: Settings ha bisogno di leggere lo stato corrente
 * dei flag per popolare i toggle, altrimenti dopo un refresh dell'auth
 * (es. dopo "Salva modifiche") il useEffect re-fetcha e legge
 * `undefined`, riportando i toggle a OFF anche se in DB sono true.
 *
 * `pin_hash`, `created_at`, `updated_at` restano nascosti.
 */
export function toSelfMember(member: Member): MemberSelf {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pin_hash, created_at, updated_at, ...rest } = member
  return rest as MemberSelf
}
