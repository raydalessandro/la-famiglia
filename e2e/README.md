# E2E tests

Playwright smoke tests for the critical paths.

## Running

```sh
npm install
npx playwright install chromium
npm run e2e
```

The dev server is started automatically by Playwright (`webServer` in
`playwright.config.ts`). To target a remote URL instead:

```sh
PLAYWRIGHT_BASE_URL=https://staging.example.com npm run e2e
```

## Required env (local dev)

These tests assume the dev server can talk to a working Supabase backend with
at least one active member. Set the same env that `next dev` needs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

For full coverage the tests also need a known seed member. Provide a PIN to log
in with:

- `E2E_MEMBER_PIN` (defaults to skipping login-dependent tests)

## What's covered

- `login.spec.ts` — login page renders, PIN flow submits.
- `feed.spec.ts` — once logged in, feed shows posts and the create-post sheet
  opens.
- `smoke.spec.ts` — manifest is reachable, service worker file is reachable,
  unauthenticated `/feed` redirects to `/login`.

These are deliberately minimal — they catch regressions in the auth + routing
layer, not feature correctness. Feature correctness is covered by Vitest in
`specs/tests/`.
