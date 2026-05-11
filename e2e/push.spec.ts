import { test, expect } from '@playwright/test'

const PIN = process.env.E2E_MEMBER_PIN

// Skip the whole file unless a seed PIN is provided — same convention as
// feed.spec.ts. Senza un member di test seedato non possiamo loggarci.
test.skip(!PIN, 'E2E_MEMBER_PIN not set — skipping authenticated push tests')

test.describe('push notifications — toggle Settings', () => {
  test.beforeEach(async ({ page, context, request }) => {
    // 1. Permessi di notifica (Chromium li nega di default in test mode)
    await context.grantPermissions(['notifications'])

    // 2. Mock di pushManager.subscribe PRIMA che la pagina carichi.
    //    Su localhost Chromium non ha un push service configurato e
    //    subscribe() lancerebbe. Sostituiamo con una fake subscription
    //    deterministica: tanto il bug che testiamo vive nel flusso
    //    state/DOM, non nel browser push API.
    await page.addInitScript(() => {
      // Aspetta che il SW si registri, poi sovrascrivi pushManager.
      const FAKE_SUB = {
        endpoint: 'https://e2e.example/fake-endpoint',
        expirationTime: null,
        toJSON: () => ({
          endpoint: 'https://e2e.example/fake-endpoint',
          keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
        }),
        getKey: () => null,
        unsubscribe: () => Promise.resolve(true),
        options: { userVisibleOnly: true, applicationServerKey: null },
      }
      const proto = (globalThis as unknown as {
        ServiceWorkerRegistration?: { prototype: Record<string, unknown> }
      }).ServiceWorkerRegistration?.prototype
      if (proto) {
        Object.defineProperty(proto, 'pushManager', {
          configurable: true,
          get() {
            return {
              subscribe: async () => FAKE_SUB,
              getSubscription: async () => null,
              permissionState: async () => 'granted',
            }
          },
        })
      }
    })

    // 3. Intercetta solo le route push: non vogliamo dipendere da VAPID
    //    env in CI né scrivere subscription nel DB di test. Le route
    //    /api/members/* vengono lasciate andare al server REALE: è
    //    quel pezzo che deve ritornare notify_push nel payload (vedi
    //    bug fix toPublicMember → toSelfMember).
    await page.route('**/api/push/public-key', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { key: 'BFakePublicKey1234567890' }, error: null }),
      }),
    )
    await page.route('**/api/push/subscribe', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            member_id: 'e2e-member',
            endpoint: 'https://e2e.example/fake-endpoint',
            keys_p256dh: 'fake-p256dh',
            keys_auth: 'fake-auth',
          },
          error: null,
        }),
      }),
    )
    await page.route('**/api/push/test', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { sent: true }, error: null }),
      }),
    )

    // 4. Login (pattern condiviso con feed.spec.ts)
    const membersRes = await request.get('/api/auth/members')
    const { data: members } = await membersRes.json()
    const member = members?.[0]
    expect(member, 'no members seeded for E2E').toBeTruthy()

    const loginRes = await request.post('/api/auth', {
      data: { member_id: member.id, pin: PIN },
    })
    expect(loginRes.ok(), 'login failed — wrong E2E_MEMBER_PIN?').toBeTruthy()

    const state = await request.storageState()
    await page.context().addCookies(state.cookies)
  })

  test('toggle Notifiche push resta ON dopo "Salva modifiche" (regression)', async ({ page }) => {
    // Bug del 11/05/2026: il toggle si spegneva da solo dopo Save perché
    // la GET /api/members/:id strippava notify_push (toPublicMember).
    // Garantiamo che il flag persista visivamente attraverso il refetch
    // che Save scatena via refreshAuth().
    await page.goto('/settings')

    // Identifica il toggle dal suo aria-label (vedi settings/page.tsx)
    const pushToggle = page.getByRole('switch', { name: /notifiche push/i })
    await expect(pushToggle).toBeVisible()

    // Stato iniziale: il test member parte con notify_push false
    // (puoi precondizionare via DB se serve — qui assumiamo OFF).
    const initialChecked = await pushToggle.getAttribute('aria-checked')

    // Attiva il toggle se è OFF
    if (initialChecked === 'false') {
      await pushToggle.click()
      // Aspetta che il toast "Notifiche attivate" appaia (best-effort)
      await expect(page.getByText(/notifiche attivate/i)).toBeVisible({ timeout: 5_000 })
      await expect(pushToggle).toHaveAttribute('aria-checked', 'true')
    }

    // Modifica un campo qualsiasi per rendere il Save sensato
    const bioField = page.getByLabel(/bio/i).or(page.locator('textarea').first())
    if (await bioField.isVisible().catch(() => false)) {
      await bioField.fill(`e2e bio ${Date.now()}`)
    }

    // Premi Salva modifiche
    const saveButton = page.getByRole('button', { name: /salva modifiche/i })
    await saveButton.click()

    // Toast conferma
    await expect(page.getByText(/impostazioni salvate/i)).toBeVisible({ timeout: 5_000 })

    // ASSERTION CRITICA: il toggle resta ON
    // Senza il fix toSelfMember, qui aria-checked tornerebbe a "false".
    await expect(pushToggle).toHaveAttribute('aria-checked', 'true')

    // Cleanup: rimettiamo il toggle a OFF per non lasciare side-effect
    // (la sub fake non esiste nel DB ma notify_push sì)
    await pushToggle.click()
    await expect(pushToggle).toHaveAttribute('aria-checked', 'false', { timeout: 5_000 })
  })

  test('bottone "Invia notifica di prova" appare solo quando toggle ON', async ({ page }) => {
    await page.goto('/settings')

    const pushToggle = page.getByRole('switch', { name: /notifiche push/i })
    const testLink = page.getByRole('button', { name: /invia notifica di prova/i })

    // Stato di partenza: se OFF, il link non c'è
    const checked = await pushToggle.getAttribute('aria-checked')
    if (checked === 'false') {
      await expect(testLink).toBeHidden()
      await pushToggle.click()
      await expect(pushToggle).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 })
    }

    // Link visibile e cliccabile
    await expect(testLink).toBeVisible()
    await testLink.click()
    await expect(page.getByText(/notifica inviata/i)).toBeVisible({ timeout: 5_000 })

    // Cleanup
    await pushToggle.click()
  })
})

// Test che NON richiedono auth — coprono il contratto base dell'API push
test.describe('push notifications — auth wall', () => {
  test('POST /api/push/subscribe respinge senza session', async ({ request }) => {
    const res = await request.post('/api/push/subscribe', {
      data: {
        endpoint: 'https://example/x',
        keys: { p256dh: 'p', auth: 'a' },
      },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/push/test respinge senza session', async ({ request }) => {
    const res = await request.post('/api/push/test')
    expect(res.status()).toBe(401)
  })

  test('GET /api/push/public-key è raggiungibile (non richiede auth)', async ({ request }) => {
    // La public key non è un secret. Va servita senza auth perché il
    // service worker (no cookies) e la PWA pre-auth possono richiederla.
    const res = await request.get('/api/push/public-key')
    expect([200, 500]).toContain(res.status()) // 500 valido se VAPID env mancante in test
  })
})
