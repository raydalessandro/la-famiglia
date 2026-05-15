import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { emit } from '@/lib/notification-events'
import type { Member } from '@/types/database'

/**
 * GET /api/cron/birthday-notifications
 *
 * Endpoint chiamato dal Vercel Cron giornaliero (vedi `vercel.json`,
 * schedule `0 6 * * *` = 06:00 UTC = ~08:00 ora italiana). Vercel
 * Cron usa GET di default e firma con `Authorization: Bearer <secret>`.
 * Trova i
 * membri attivi che compiono gli anni oggi e per ognuno emette
 * l'evento `birthday` del catalog, che a sua volta notifica TUTTI
 * gli altri membri attivi (escluso il festeggiato).
 *
 * # Autenticazione
 *
 * Vercel Cron firma le request con `Authorization: Bearer <CRON_SECRET>`.
 * Il secret va impostato come env `CRON_SECRET` su Vercel — l'utente
 * lo aggiunge manualmente nella dashboard (NON da codice). Senza
 * CRON_SECRET corretto, ritorniamo 401 e ignoriamo il payload — così
 * un attacker che indovini l'URL non può triggerare push di massa.
 *
 * # Idempotenza
 *
 * Se il cron viene rieseguito lo stesso giorno (es. Vercel retry per
 * errore transient), si creano altre notification con type `birthday`
 * e partono altre push. Per la realtà di una famiglia di 5-10 persone
 * è accettabile; eventualmente in futuro si può deduplicare via
 * tabella `cron_runs` (date, kind) con UNIQUE — non in scope per ora.
 *
 * # Errori
 *
 * Niente compleanno oggi → 200 con `{ data: { processed: 0 } }`.
 * Errore DB → 500. Errore push per un member → loggato ma non blocca
 * gli altri (Promise.allSettled nel catalog).
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // Env mancante = endpoint disabilitato. Pattern coerente con altre
    // protezioni env (es. VAPID): meglio un 503 esplicito di un 200
    // silenzioso, così l'errore è visibile nei log Vercel.
    return NextResponse.json(
      { data: null, error: 'CRON_SECRET non configurato sul server' },
      { status: 503 },
    )
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { data: null, error: 'Non autorizzato' },
      { status: 401 },
    )
  }

  const now = new Date()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const year = now.getUTCFullYear()

  const db = createServerClient()
  const { data: members, error } = await db
    .from('members')
    .select('*')
    .eq('is_active', true)
    .not('birth_date', 'is', null)

  if (error) {
    console.error('[cron birthdays] fetch members failed:', error.message)
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  // Stesso filtro JS della route /api/birthdays/today (vedi nota lì
  // sul perché non usiamo `extract` lato Postgres tramite postgrest).
  const birthdayMembers = (members ?? []).filter((m) => {
    const member = m as Member
    if (!member.birth_date) return false
    const [, m2, d2] = member.birth_date.split('-')
    return parseInt(m2, 10) === month && parseInt(d2, 10) === day
  }) as Member[]

  // Emit dell'evento birthday per ciascun festeggiato. Catalog si
  // occupa di costruire title/body/link e di notificare tutti gli
  // altri membri attivi. Errori per-member non bloccano gli altri.
  const results = await Promise.allSettled(
    birthdayMembers.map((m) => {
      const birthYear = parseInt(m.birth_date!.slice(0, 4), 10)
      const age = year - birthYear
      return emit('birthday', {
        member: { id: m.id, name: m.name },
        age,
      })
    }),
  )

  const failures = results.filter((r) => r.status === 'rejected').length
  return NextResponse.json({
    data: {
      processed: birthdayMembers.length,
      failed: failures,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    },
    error: null,
  })
}
