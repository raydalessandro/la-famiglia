import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import type { BirthdayToday, Member, MemberPublic } from '@/types/database'
import { toPublicMember } from '@/lib/auth'

/**
 * GET /api/birthdays/today → ApiResponse<BirthdayToday[]>
 *
 * Lista dei membri attivi che compiono gli anni OGGI (data del server).
 * Indipendente dall'anno di nascita: matcha solo (mese, giorno). Usata
 * da:
 *  - banner sul feed lato client per mostrare "🎉 Oggi Marco compie X
 *    anni. Auguri!" (la pagina /feed la chiama ad ogni mount).
 *  - `/api/cron/birthday-notifications` (cron Vercel giornaliero) per
 *    spedire la push di auguri.
 *
 * Query usa `extract(month from birth_date)` / `extract(day from ...)`
 * — coerente con l'index `idx_members_birthday` creato dalla migration
 * 013. La forma `to_char(date, 'MM-DD')` non è IMMUTABLE in Postgres
 * (vedi changelog 013 per il dettaglio) e non si indicizza.
 *
 * Il campo `age` viene calcolato server-side (anno corrente - anno di
 * nascita) per evitare drift tra timezone server e client. Lo
 * facciamo qui invece che nel client perché l'età è un dato derivato
 * stabile per una data data, non c'è motivo di ri-calcolarlo in ogni
 * device.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  // Data odierna nel timezone del server. Vercel runs UTC; per una
  // famiglia italiana l'edge case è tra le 00:00 e le 02:00 ora
  // locale, in cui il "compleanno di oggi" in UTC è ancora ieri.
  // Decisione: accettiamo questo lieve disallineamento — il banner
  // compare entro le ore notturne UTC, gli utenti aprono l'app la
  // mattina (e l'avviso ovviamente sarà già lì per loro). Il cron è
  // schedulato alle 06:00 UTC (= 07:00–08:00 ora italiana) per la
  // notifica push, dopo il rollover.
  const now = new Date()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const year = now.getUTCFullYear()

  const db = createServerClient()
  // Fetch dei membri attivi con birth_date valorizzato — il filtro
  // mese/giorno lo facciamo qui in JS. PostgREST non espone filtri
  // su espressioni come `extract(month from ...)`; servirebbe una
  // RPC dedicata o una vista, e a scala famiglia (≤20 membri attivi)
  // il filter in-memory è gratis. L'index 013 resta comunque utile
  // se in futuro qualcuno scrive una RPC su questa stessa query.
  const { data: members, error } = await db
    .from('members')
    .select('*')
    .eq('is_active', true)
    .not('birth_date', 'is', null)

  if (error) {
    return NextResponse.json({ data: [], error: error.message }, { status: 500 })
  }

  const birthdays: BirthdayToday[] = (members ?? [])
    .filter((m) => {
      const member = m as Member
      if (!member.birth_date) return false
      // birth_date è ISO `YYYY-MM-DD` (postgrest serializza DATE
      // come stringa). Parsing posizionale per evitare i giochi
      // tra timezone del server e Date(): "2026-05-15" passato a
      // new Date() viene interpretato come UTC 00:00, scendendo di
      // un giorno in fuso CEST e dando off-by-one.
      const [, m2, d2] = member.birth_date.split('-')
      return parseInt(m2, 10) === month && parseInt(d2, 10) === day
    })
    .map((m) => {
      const member = m as Member
      const birthYear = parseInt(member.birth_date!.slice(0, 4), 10)
      const age = year - birthYear
      const pub: MemberPublic = toPublicMember(member)
      return { ...pub, birth_date: member.birth_date!, age }
    })

  return NextResponse.json({ data: birthdays, error: null })
}
