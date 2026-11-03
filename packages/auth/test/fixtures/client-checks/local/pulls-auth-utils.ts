import { defineNuxtModule } from '@nuxt/kit'

// A module that installs nuxt-auth-utils through async `moduleDependencies`, for the "installed by" error.
export default defineNuxtModule({
  meta: { name: 'pulls-auth-utils' },
  moduleDependencies: async () => ({ 'nuxt-auth-utils': { version: '>=0.0.1' } }),
})
