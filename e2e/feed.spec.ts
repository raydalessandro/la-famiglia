import { test, expect } from '@playwright/test'

const PIN = process.env.E2E_MEMBER_PIN

// Skip the whole file unless a seed PIN is provided.
test.skip(!PIN, 'E2E_MEMBER_PIN not set — skipping authenticated tests')

test.describe('authenticated feed', () => {
  test.beforeEach(async ({ page, request }) => {
    // Pick the first active member from the public list.
    const membersRes = await request.get('/api/auth/members')
    expect(membersRes.ok()).toBeTruthy()
    const membersJson = await membersRes.json()
    const member = membersJson.data?.[0]
    expect(member, 'no members found — seed at least one').toBeTruthy()

    const loginRes = await request.post('/api/auth', {
      data: { member_id: member.id, pin: PIN },
    })
    expect(loginRes.ok(), 'login failed — check E2E_MEMBER_PIN').toBeTruthy()

    const cookies = await request.storageState()
    await page.context().addCookies(cookies.cookies)
  })

  test('feed renders without errors', async ({ page }) => {
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/feed$/)
    // The bottom nav is the most reliable post-auth landmark.
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 10_000 })
  })
})
