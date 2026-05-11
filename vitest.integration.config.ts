import { defineConfig } from 'vitest/config'
import { readFileSync } from 'fs'
import path from 'path'

// Integration tests talk to the real Supabase project. The standard
// vitest.config.ts stubs env vars to fake values for unit tests; here we
// load the actual values from .env.local. Keep this config separate so
// `npm test` stays hermetic.

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const content = readFileSync(path.resolve(__dirname, '.env.local'), 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m) out[m[1]] = m[2]
    }
  } catch {
    // missing file — tests will fail with a clear message
  }
  return out
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['specs/integration/**/*.test.ts'],
    env: loadEnvLocal(),
    // Integration tests touch a real DB — run sequentially to avoid races
    // when several tests insert/cleanup the same test rows.
    fileParallelism: false,
    testTimeout: 15_000,
  },
})
