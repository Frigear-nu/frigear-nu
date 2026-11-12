import { fileURLToPath } from 'node:url'
import { defineNuxtModule } from '@nuxt/kit'
import { addPolicies } from '../../../../src/runtime/utils/build'

const file = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url))

// A module with a shared policy file and a server-only one, for `#auth/shared-policies` in client mode.
export default defineNuxtModule<{ broken?: boolean }>({
  meta: { name: 'module-policies', configKey: 'modulePolicies' },
  setup(options, nuxt) {
    addPolicies(nuxt, { path: file('shared-policies.ts'), shared: true })
    addPolicies(nuxt, { path: file('server-policies.ts') })
    if (options.broken) addPolicies(nuxt, { path: file('server-shared-policies.ts'), shared: true })
  },
})
