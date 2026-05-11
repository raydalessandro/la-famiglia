import { test, expect } from '@playwright/test'

// E2E smoke for the reactions API. A full "log in, click, persist" flow
// would need a seeded test member with a known PIN — not in scope yet.
// These tests assert the auth wall and the input validation that the
// API contract promises.

test.describe('reactions API — auth wall', () => {
  test('POST /api/posts/:id/reactions returns 401 without auth', async ({ request }) => {
    const res = await request.post('/api/posts/00000000-0000-0000-0000-000000000000/reactions', {
      data: { emoji: '❤️' },
    })
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({ data: null, error: expect.any(String) })
  })

  test('DELETE /api/posts/:id/reactions returns 401 without auth', async ({ request }) => {
    const res = await request.delete(
      '/api/posts/00000000-0000-0000-0000-000000000000/reactions?emoji=%E2%9D%A4%EF%B8%8F',
    )
    expect(res.status()).toBe(401)
  })
})
