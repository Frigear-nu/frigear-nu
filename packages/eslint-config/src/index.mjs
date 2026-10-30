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
}, {
  // A module's runtime is installed in the host's `node_modules`, where Nuxt does not auto-import into the app code
  // of a module (only of a layer), so it imports what it uses from `#imports` explicitly. Its server code is carved
  // out of Nitro's auto-import exclude by `inlineModuleRuntime` (`@frigear-nu/module-kit`) instead.
  name: 'frigear/module-runtime-imports',
  files: ['src/runtime/**/*.{js,mjs,ts,vue}'],
  ignores: ['src/runtime/server/**'],
  rules: { 'no-undef': 'error' },
})
