/**
 * Vitest global setup file
 * Runs before each test file.
 */

// Extend jest-dom matchers (toBeInTheDocument, toHaveClass, etc.)
import '@testing-library/jest-dom/vitest'

// ---------------------------------------------------------------------------
// next/navigation mock
// ---------------------------------------------------------------------------
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    pathname: '/',
  })),
  useParams: vi.fn(() => ({})),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

// ---------------------------------------------------------------------------
// next/headers mock
// ---------------------------------------------------------------------------
vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      getAll: vi.fn(() => []),
    })
  ),
  headers: vi.fn(() =>
    Promise.resolve(new Headers())
  ),
}))
