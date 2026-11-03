import { createConfigForNuxt } from '@nuxt/eslint-config'

export default createConfigForNuxt({
  features: {
    tooling: true,
    stylistic: true,
    standalone: true,
    typescript: true,
  },
}, {
  ignores: ['dist/**', '.nuxt/**', '.output/**', '.data/**', '.example/**', 'playground/**'],
})
