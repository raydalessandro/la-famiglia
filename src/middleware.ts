import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/setup', '/api/auth', '/api/setup']
const COOKIE_NAME = 'famiglia_session'

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json).*)']
}
