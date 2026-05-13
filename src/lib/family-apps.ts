/**
 * Registry delle app sorelle dell'ecosistema La Famiglia.
 *
 * Pattern: ogni app è una entry in FAMILY_APPS. L'AppLauncher
 * nell'header genera un popover con la griglia di tutte le app
 * elencate qui. Aggiungere una nuova app = 1 entry + 1 logo in
 * `public/apps/`.
 *
 * Stato:
 *   - `url: string`  → live, il card apre l'app in una nuova tab
 *   - `url: null`    → in arrivo, il card è disabilitato con label
 *                      "In arrivo" sotto al nome
 *
 * Logo: PNG o SVG in `public/apps/`. SVG preferito per scalabilità;
 * PNG ok per loghi illustrati (es. Cucina). Dimensione consigliata
 * 512×512 max — Next.js Image li ottimizza a runtime alla size
 * effettiva di rendering.
 */

export type FamilyApp = {
  id: string
  name: string
  description: string
  url: string | null
  logoSrc: string
  // Accent color usato come bordo/glow del card. Opzionale.
  accent?: string
}

export const FAMILY_APPS: FamilyApp[] = [
  {
    id: 'music',
    name: 'Music',
    description: 'Player musicale di famiglia',
    url: 'https://spotimai.vercel.app',
    logoSrc: '/apps/music.svg',
    accent: '#34d399',
  },
  {
    id: 'cucina',
    name: 'Cucina in Famiglia',
    description: 'Le ricette di casa',
    // TODO: aggiungere URL deploy quando l'app va live. Fino ad
    // allora il card resta "In arrivo" (non cliccabile).
    url: null,
    logoSrc: '/apps/cucina-in-famiglia.png',
    accent: '#A8B89C',
  },
]
