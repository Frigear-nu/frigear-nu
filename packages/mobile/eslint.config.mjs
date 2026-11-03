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
    // Pure logic shared by the build, the CLI and the app: no Vue, Nuxt or Capacitor imports, so it is unit-testable.
    files: ['src/runtime/shared/**', 'src/runtime/cli/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['vue', 'vue/*', '@vue/*', 'nuxt', 'nuxt/*', '@nuxt/*', '#*'], message: 'Shared code is framework-agnostic.' },
          { group: ['@capacitor/*', '@capgo/*'], message: 'Native plugins load through #mobile/native in app code.' },
        ],
      }],
    },
  })
