import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests für die Web-App und für die reine Logik der Edge Functions.
export default defineConfig({
  test: {
    globals: true,
    dir: resolve(import.meta.dirname, '..'),
    include: ['web/src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
    environment: 'node',
  },
})
