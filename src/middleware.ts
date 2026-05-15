import { NextRequest, NextResponse } from 'next/server'

// `/api/cron` è pubblico al middleware perché chiamato da Vercel Cron
// infrastructure senza cookie session. Ogni endpoint sotto /api/cron/*
// è responsabile della propria autorizzazione via `Authorization: Bearer
// <CRON_SECRET>` (vedi `/api/cron/birthday-notifications/route.ts`).
const PUBLIC_PATHS = ['/login', '/setup', '/api/auth', '/api/setup', '/api/cron']
const COOKIE_NAME = 'famiglia_session'

// In-memory rate limiter — sufficient for a small family-scale app.
// For multi-instance deployments, swap for Redis/Upstash.
const RL_WINDOW_MS = 60_000
const RL_MAX_REQUESTS = 60        // mutations per IP per window
const RL_LOGIN_WINDOW_MS = 60_000
const RL_LOGIN_MAX = 10           // login attempts per IP per minute (brute-force defence)

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= max) return false

  bucket.count++
  return true
}

// Periodic cleanup of expired buckets to keep memory bounded.
let lastCleanup = Date.now()
function maybeCleanup(): void {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const method = request.method

  maybeCleanup()

  // Brute-force defence on login (POST /api/auth) — applies even before auth.
  if (pathname === '/api/auth' && method === 'POST') {
    const ip = getClientIp(request)
    if (!rateLimit(`login:${ip}`, RL_LOGIN_MAX, RL_LOGIN_WINDOW_MS)) {
      return NextResponse.json(
        { data: null, error: 'Troppi tentativi di login. Riprova tra un minuto.' },
        { status: 429 }
      )
    }
  }

  // General mutation rate limit on /api/* (excludes GET/HEAD).
  if (pathname.startsWith('/api/') && method !== 'GET' && method !== 'HEAD') {
    const ip = getClientIp(request)
    if (!rateLimit(`api:${ip}`, RL_MAX_REQUESTS, RL_WINDOW_MS)) {
      return NextResponse.json(
        { data: null, error: 'Troppe richieste. Riprova tra un minuto.' },
        { status: 429 }
      )
    }
  }

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  const cookie = request.cookies.get(COOKIE_NAME)
  const hasSession = cookie !== undefined && cookie.value !== ''

  if (!hasSession && !isPublic && pathname.startsWith('/api/')) {
    return NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
  }

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (hasSession && pathname === '/login') {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)']
}
