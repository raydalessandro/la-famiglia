// @vitest-environment node
/**
 * Test: Root layout — CSS and metadata correctness
 *
 * Bug: CSS 404 after navigation (layout.css?v=XXX not found)
 * Root cause: Manual <head> tag in layout.tsx conflicts with Next.js App Router
 * automatic head management. Next.js injects CSS links into <head> at build time,
 * but a manual <head> tag can cause hydration mismatch and stale CSS references.
 *
 * Fix: Remove manual <head>, use Metadata export for manifest/theme-color.
 *
 * These tests verify the layout follows Next.js App Router conventions.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const LAYOUT_PATH = join(__dirname, '../../src/app/layout.tsx')

describe('Root layout — App Router conventions', () => {
  let content: string

  try {
    content = readFileSync(LAYOUT_PATH, 'utf-8')
  } catch {
    content = ''
  }

  it('does NOT contain a manual <head> tag', () => {
    // Next.js App Router manages <head> automatically.
    // A manual <head> causes CSS hydration issues and stale bundle references.
    expect(content).not.toMatch(/<head>/)
    expect(content).not.toMatch(/<head\s/)
  })

  it('imports globals.css', () => {
    expect(content).toMatch(/import\s+['"]\.\/globals\.css['"]/)
  })

  it('uses Metadata export for manifest (not <link> tag)', () => {
    expect(content).not.toMatch(/<link\s+rel="manifest"/)
    expect(content).toMatch(/manifest:\s*['"]\/manifest\.webmanifest['"]/)
  })

  it('uses Viewport export for theme-color (not <meta> tag)', () => {
    expect(content).not.toMatch(/<meta\s+name="theme-color"/)
    // themeColor must live on the Viewport export per Next 14+ rules.
    expect(content).toMatch(/export\s+const\s+viewport[\s\S]*themeColor:\s*['"]#E8A838['"]/)
  })

  it('has <html lang="it">', () => {
    expect(content).toMatch(/lang="it"/)
  })

  it('body has dark background class', () => {
    expect(content).toMatch(/bg-\[#1a1a2e\]/)
  })
})
