// Workaround for @frigear-nu/auth 0.5.0 in client mode: `useAuthorization()` (@frigear-nu/authorization) imports
// `#auth/shared-policies`, which auth only provides in server mode, so `nuxt generate` failed with "failed to resolve
// import #auth/shared-policies". This provides it, with no shared policies (the issuer's API decides every request),
// whenever auth did not. It does nothing once auth provides it itself; delete this file then.
import { addTemplate, defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'shared-policies' },
  setup(_options, nuxt) {
    nuxt.hook('modules:done', () => {
      if (nuxt.options.alias['#auth/shared-policies']) return
      const template = addTemplate({
        filename: 'auth/shared-policies.mjs',
        write: true,
        getContents: () => 'export const policies = []\n',
      })
      nuxt.options.alias['#auth/shared-policies'] = template.dst
    })
  },
})
