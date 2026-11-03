import { defineNuxtModule } from '@nuxt/kit'

// A module that tries to pick the auth mode through a dependency default, which Nuxt merges too late.
export default defineNuxtModule({
  meta: { name: 'client-default' },
  moduleDependencies: {
    '@frigear-nu/auth': { defaults: { mode: 'client' } },
  },
})
