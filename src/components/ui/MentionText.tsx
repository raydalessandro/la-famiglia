'use client'

import React, { useMemo } from 'react'
import { MemberLink } from './MemberLink'
import type { MemberPublic } from '@/types/database'

/**
 * Renderizza un testo libero trasformando i token `@nome` in
 * `<MemberLink>` cliccabili (apre `/family/{id}`) quando il `nome`
 * matcha un member della famiglia. Niente match → testo plain.
 *
 * # Coerenza col parser server-side
 *
 * La regex e le regole di match sono allineate a `src/lib/mentions.ts`
 * (case-insensitive, match esatto del nome, niente spazi). Se mai
 * cambierà la sintassi delle mention, va aggiornata SIA qui SIA nel
 * parser server — altrimenti la mention DB esiste ma il client non
 * la renderizza, o viceversa.
 *
 * Performance: il componente è O(text.length + members.length) per
 * render. A scala famiglia (testo ≤ qualche kB, membri ≤ 20) è
 * trascurabile. useMemo cache i nodi se text/members non cambiano.
 *
 * # Caratteri preservati
 *
 * Newline e whitespace nel testo originale sono mantenuti: chi
 * renderizza dovrebbe avvolgere il componente in un wrapper con
 * `whitespace-pre-wrap` se vuole il line-break.
 */
const MENTION_RE = /@([\p{L}][\p{L}\p{N}_-]*)/gu

export function MentionText({
  text,
  members,
  className,
}: {
  text: string
  members: Pick<MemberPublic, 'id' | 'name'>[]
  className?: string
}) {
  const nodes = useMemo(() => buildNodes(text, members), [text, members])

  if (className) {
    return <span className={className}>{nodes}</span>
  }
  return <>{nodes}</>
}

function buildNodes(
  text: string,
  members: Pick<MemberPublic, 'id' | 'name'>[],
): React.ReactNode[] {
  if (!text) return []

  // Indice case-insensitive nome → id. Per le mention non importa
  // ordinare per lunghezza (il match è esatto, niente prefix).
  const byName = new Map(members.map((m) => [m.name.toLowerCase(), m]))

  const out: React.ReactNode[] = []
  let cursor = 0
  let keyCounter = 0

  for (const match of text.matchAll(MENTION_RE)) {
    const matchStart = match.index ?? 0
    const matchEnd = matchStart + match[0].length
    const token = match[1].toLowerCase()
    const member = byName.get(token)

    if (!member) continue // non è una mention reale, skip — lasciamo nel run text

    // Plain text dal cursor al matchStart
    if (matchStart > cursor) {
      out.push(text.slice(cursor, matchStart))
    }

    out.push(
      <MemberLink
        key={`mention-${keyCounter++}-${member.id}-${matchStart}`}
        memberId={member.id}
        className="font-semibold text-[#E8A838] hover:underline"
        ariaLabel={`Apri profilo di ${member.name}`}
      >
        @{member.name}
      </MemberLink>,
    )

    cursor = matchEnd
  }

  // Trailing text dopo l'ultima mention
  if (cursor < text.length) {
    out.push(text.slice(cursor))
  }

  return out
}
