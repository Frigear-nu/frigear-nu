// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Run `npx @eslint/config-inspector` to inspect the resolved config interactively
export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Rules for formatting
    stylistic: true,
  },
  dirs: {
    src: [
      './playground',
    ],
  },
})
  .append({
    // Test fixtures are apps: their pages are routes (`index`, `login`).
    files: ['test/fixtures/**'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  })
  .append({
    // `@frigear-nu/auth/client-core` runs anywhere `fetch` and WebCrypto do: no Vue, Nuxt or Capacitor in it.
    files: ['src/runtime/client/core/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['vue', 'vue/*', '@vue/*', 'nuxt', 'nuxt/*', '@nuxt/*', '#*', 'h3', 'ofetch'], message: 'The core is framework-agnostic: no Vue or Nuxt imports.' },
          { group: ['@capacitor/*', '@aparajita/*'], message: 'Native plugins belong in ../capacitor, not the core.' },
          { group: ['../*'], message: 'The core only imports from itself.' },
        ],
      }],
    },
  })
  .append({
    // The permission core and `@frigear-nu/auth/policies` run in the app, on the server and on resource servers.
    files: ['src/runtime/utils/permissions.ts', 'src/runtime/policies.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['vue', 'vue/*', '@vue/*', 'nuxt', 'nuxt/*', '@nuxt/*', '#*', 'h3', '@nuxthub/*', 'drizzle-orm', 'drizzle-orm/*'], message: 'Permissions are framework-free: no Vue, Nuxt, h3 or database imports.' },
        ],
      }],
    },
  })
