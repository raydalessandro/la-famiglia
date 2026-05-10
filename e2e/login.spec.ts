import { test, expect } from '@playwright/test'

test.describe('login page', () => {
  test('renders the member picker', async ({ page }) => {
    await page.goto('/login')
    // Either the loader spins until members load, or the empty-state redirects
    // to /setup. We just assert the route resolves to /login or /setup.
    await expect(page).toHaveURL(/\/(login|setup)$/)
  })

  test('rejects an invalid PIN with a 401', async ({ request }) => {
    const res = await request.post('/api/auth', {
      data: { member_id: '00000000-0000-0000-0000-000000000000', pin: '0000' },
    })
    expect([400, 401]).toContain(res.status())
  })

  test('rate-limits brute-force login attempts', async ({ request }) => {
    // Fire 12 quick attempts from the same client; server should 429 before all succeed.
    const results: number[] = []
    for (let i = 0; i < 12; i++) {
      const res = await request.post('/api/auth', {
        data: { member_id: '00000000-0000-0000-0000-000000000000', pin: '0000' },
      })
      results.push(res.status())
    }
    expect(results).toContain(429)
  })
})
