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
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  })
  .append({
    // `@frigear-nu/oauth-client/core` runs anywhere `fetch` and WebCrypto do: no Vue, Nuxt or Capacitor in it.
    files: ['src/runtime/core/**'],
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
