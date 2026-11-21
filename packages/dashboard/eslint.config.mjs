// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Rules for formatting
    stylistic: true,
  },
})
  .append({
    rules: {
      // `Dashboard` is the component's name, matching `<WidgetArea>` and the other registries.
      'vue/multi-word-component-names': 'off',
    },
  })
