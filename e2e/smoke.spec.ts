import { test, expect } from '@playwright/test'

test.describe('smoke', () => {
  test('manifest is reachable and well-formed', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.name).toBe('La Famiglia')
    expect(json.start_url).toBe('/feed')
  })

  test('service worker file is reachable', async ({ request }) => {
    const res = await request.get('/sw.js')
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain("addEventListener('install'")
  })

  test('unauthenticated /feed redirects to /login', async ({ page }) => {
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('unauthenticated API call returns 401 JSON', async ({ request }) => {
    const res = await request.get('/api/posts')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({ data: null, error: expect.any(String) })
  })
})
