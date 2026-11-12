import { defineNuxtModule } from '@nuxt/kit'

// Stands in for `@frigear-nu/authorization` (admin only checks that a module of this name is installed). Depending on the
// real one would make a workspace cycle (it has admin as a dev dependency); its own fixtures cover the enforcement.
export default defineNuxtModule({ meta: { name: '@frigear-nu/authorization' } })
