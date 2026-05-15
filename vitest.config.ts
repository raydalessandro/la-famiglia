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
    include: ['specs/tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./specs/tests/setup.ts'],
    // Stub env vars so Supabase client initialises without crashing
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      // VAPID env stub: `lib/notifications.ts` ora legge le env in
      // modo lazy (`readVapidConfig`) e ritorna null se anche una
      // delle due manca → `sendPushNotification` esce con false senza
      // chiamare webpush. I test mockano `web-push` direttamente
      // quindi questi valori non vengono mai mandati a un servizio
      // reale — servono solo a passare il check di presenza lazy.
      VAPID_PUBLIC_KEY: 'test-vapid-public',
      VAPID_PRIVATE_KEY: 'test-vapid-private',
    },
    // Per-file environment overrides are declared via the
    // `// @vitest-environment node` docblock at the top of each test file
    // that needs node (next/server, next/headers, fs, etc.).
    // This replaces `environmentMatchGlobs`, removed in vitest 4.
  },
})
