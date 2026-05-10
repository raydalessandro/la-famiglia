import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['specs/tests/**/*.test.ts'],
    setupFiles: ['./specs/tests/setup.ts'],
    // Stub env vars so Supabase client initialises without crashing
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
    // Per-file environment overrides are declared via the
    // `// @vitest-environment node` docblock at the top of each test file
    // that needs node (next/server, next/headers, fs, etc.).
    // This replaces `environmentMatchGlobs`, removed in vitest 4.
  },
})
