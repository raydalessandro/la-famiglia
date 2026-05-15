import type { Member, MemberPublic, Mention } from '@/types/database'
import { createServerClient } from './supabase/client'

/**
 * Estrae le `@menzioni` da un testo libero e le risolve contro la lista
 * dei membri della famiglia.
 *
 * Regole del parser:
 *  - Match: `@` seguito da almeno un carattere alfabetico Unicode, poi
 *    proseguono lettere/numeri/underscore/trattino. Niente spazi nel
 *    nome — chi ha "Maria Elena" come name DB scrive `@Maria` o
 *    `@MariaElena`; il match si ferma al primo spazio. Decisione di
 *    prodotto: i nomi univoci a 1 parola sono normali in famiglia
 *    italiana ("Mario", "Lucia", "Marco"). Niente quote-syntax
 *    `@"Maria Elena"` perché complicherebbe l'editor mobile.
 *  - Case-insensitive: `@marco`, `@Marco`, `@MARCO` matchano tutti
 *    un member con name "Marco".
 *  - Match esatto sulla parte sinistra del nome: il token `@Marco`
 *    matcha "Marco" ma anche "Marcolino" (prefix). Per evitare
 *    ambiguità preferiamo il match più LUNGO disponibile (vedi sotto).
 *  - Dedupe: lo stesso `mentioned_id` mai più di una volta per
 *    sorgente, anche se l'autore scrive `@marco ... @marco` due volte.
 *
 * # Auto-mention: l'autore non viene incluso nei risultati anche se
 *   menziona se stesso (`@me`). Niente push a se stessi.
 */
export type ParsedMention = {
  /** Member risolto. */
  member: { id: string; name: string }
  /** Posizione del `@` nel testo originale (per debug / future feature
   *  highlight). */
  index: number
}

const MENTION_TOKEN_RE = /@([\p{L}][\p{L}\p{N}_-]*)/gu

export function parseMentions(
  text: string,
  members: Pick<Member, 'id' | 'name'>[] | MemberPublic[],
  options: { excludeAuthorId?: string } = {},
): ParsedMention[] {
  if (!text) return []
  const { excludeAuthorId } = options

  // Indice membri per nome lowercase → ordinati per lunghezza nome DESC,
  // così il match `@Maria` su un name "MariaElena" preferisce il prefix
  // più lungo se presente. Pre-computa qui.
  const byName = members
    .map((m) => ({ id: m.id, name: m.name, lower: m.name.toLowerCase() }))
    .sort((a, b) => b.lower.length - a.lower.length)

  const seen = new Set<string>()
  const out: ParsedMention[] = []

  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const token = match[1].toLowerCase()
    // Match più lungo: il primo member name che è PREFIX di token
    // (case-insensitive). Esempio: token "marcolino", member name
    // "Marcolino" → match. Se ci fosse solo "Marco", `marcolino`
    // matcherebbe "Marco" come prefix. Decisione: matchiamo solo se
    // il nome del member è ESATTAMENTE = token, niente prefix match
    // per evitare false mention.
    const found = byName.find((m) => m.lower === token)
    if (!found) continue
    if (excludeAuthorId && found.id === excludeAuthorId) continue
    if (seen.has(found.id)) continue
    seen.add(found.id)
    out.push({
      member: { id: found.id, name: found.name },
      index: match.index ?? 0,
    })
  }

  return out
}

/**
 * Inserisce le mention parse-date nel DB. Idempotenza best-effort: la
 * tabella `mentions` non ha UNIQUE constraint sul (source, mentioned)
 * quindi il dedupe è responsabilità del chiamante (vedi
 * `parseMentions` che già dedupa per `mentioned_id`).
 *
 * Ritorna le righe inserite per consentire al chiamante di emettere
 * l'evento `mention` del catalog senza ulteriori query.
 */
export async function insertMentions(
  parsed: ParsedMention[],
  source: { type: Mention['source_type']; id: string },
  authorId: string,
): Promise<Mention[]> {
  if (parsed.length === 0) return []

  const db = createServerClient()
  const rows = parsed.map((p) => ({
    source_type: source.type,
    source_id: source.id,
    mentioned_id: p.member.id,
    author_id: authorId,
  }))

  const { data, error } = await db.from('mentions').insert(rows).select()
  if (error) {
    // Non rilanciamo: la creazione della mention non è critica per il
    // success del POST source (post/comment/chat). Logghiamo e
    // ritorniamo array vuoto così niente push.
    console.error('[mentions] insert failed:', error.message)
    return []
  }
  return (data ?? []) as Mention[]
}

/**
 * Cleanup delle mention orfane quando il sorgente (post / comment)
 * viene eliminato. La FK su `members` ha CASCADE, ma su source_id
 * NO (polymorphic FK non supportata). Quindi cancellare il post NON
 * cancella automaticamente le sue mention — lo facciamo manualmente
 * qui.
 */
export async function deleteMentionsForSource(
  sourceType: Mention['source_type'],
  sourceId: string,
): Promise<void> {
  const db = createServerClient()
  const { error } = await db
    .from('mentions')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
  if (error) {
    console.error('[mentions] delete orphans failed:', error.message)
    // Non rilanciamo: la cancellazione del source è andata, le mention
    // orfane sono row residue innocue.
  }
}
