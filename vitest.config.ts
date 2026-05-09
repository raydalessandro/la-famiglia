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
    // Provide stub env vars so Supabase client initialises without crashing
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
    environmentMatchGlobs: [
      // These files use next/server (NextRequest/NextResponse) or next/headers
      // and must run in node environment
      ['specs/tests/middleware.test.ts', 'node'],
      ['specs/tests/auth.test.ts', 'node'],
      ['specs/tests/auth_routes.test.ts', 'node'],
      ['specs/tests/activities.test.ts', 'node'],
      ['specs/tests/members_pin_change.test.ts', 'node'],
      ['specs/tests/posts_images.test.ts', 'node'],
      ['specs/tests/posts_images_upload.test.ts', 'node'],
      ['specs/tests/chat_groups.test.ts', 'node'],
      ['specs/tests/layout_css.test.ts', 'node'],
    ],
  },
})
