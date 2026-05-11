// @vitest-environment node
/**
 * Regression guardrail per il bug HEIC su Safari iOS (commit 8123826).
 *
 * Storia. iPhone scatta foto in HEIC. Quando un <input type="file"
 * accept="image/*"> apre il picker iOS, iOS passa il file HEIC originale
 * al JavaScript. Safari iOS non sa decodificare HEIC nel <canvas>:
 * compressImage fallisce e l'upload va in errore (silenziosamente nel
 * feed, con "errore caricamento" in chat).
 *
 * Fix. Usare un accept esplicito con MIME types — image/jpeg,
 * image/png, image/webp. In quel caso iOS converte automaticamente
 * HEIC → JPEG alla selezione. Nessun HEIC arriva mai al JS.
 *
 * Questi test verificano che i tre file input dell'app che accettano
 * immagini (feed composer, chat composer, album upload) NON tornino mai
 * al wildcard generico. Se qualcuno modifica uno di questi file e
 * cambia l'accept, il test rosso lo blocca prima del merge.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const FILES_WITH_PHOTO_INPUT = [
  {
    label: 'feed composer',
    path: join(__dirname, '../../src/app/(main)/feed/page.tsx'),
  },
  {
    label: 'chat composer',
    path: join(__dirname, '../../src/app/(main)/chat/[id]/page.tsx'),
  },
  {
    label: 'album upload',
    path: join(__dirname, '../../src/app/(main)/albums/[id]/page.tsx'),
  },
]

// Stringhe accept ritenute sicure su iOS: forza la conversione HEIC → JPEG
// alla sorgente. L'ordine dei MIME non conta, ma image/jpeg deve esserci.
const REQUIRED_MIMES = ['image/jpeg']
// Pattern proibiti: accept generici che lasciano passare HEIC.
const FORBIDDEN_PATTERNS = [
  /accept=["']image\/\*["']/,
  /accept=["']\*\/\*["']/,
]

describe('Photo upload inputs — iOS-safe accept attribute', () => {
  FILES_WITH_PHOTO_INPUT.forEach(({ label, path }) => {
    describe(label, () => {
      let content: string

      try {
        content = readFileSync(path, 'utf-8')
      } catch {
        content = ''
      }

      it('does NOT use accept="image/*" (would let HEIC through on iOS)', () => {
        FORBIDDEN_PATTERNS.forEach((pattern) => {
          expect(content).not.toMatch(pattern)
        })
      })

      it('declares an accept attribute including image/jpeg', () => {
        // Cerchiamo un accept che contenga almeno image/jpeg. Forziamo iOS
        // a convertire HEIC → JPEG alla selezione.
        const acceptMatches = content.match(/accept=["']([^"']+)["']/g) ?? []
        // Almeno uno degli accept presenti deve contenere image/jpeg.
        const matchesRequired = acceptMatches.some((attr) =>
          REQUIRED_MIMES.every((mime) => attr.includes(mime)),
        )
        expect(acceptMatches.length).toBeGreaterThan(0)
        expect(matchesRequired).toBe(true)
      })
    })
  })
})
