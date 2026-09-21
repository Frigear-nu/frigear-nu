import { createResolver, defineNuxtModule, extendPages } from '@nuxt/kit'
import type { OAuthServerModuleOptions, OAuthServerModulePublicOptions } from './types'
import { defu } from 'defu'
import { setup } from './internal/setup'
import { objectPick } from '@vueuse/core'

export type { OAuthServerModuleOptions as ModuleOptions } from './types'

const resolver = createResolver(import.meta.url)

export default defineNuxtModule<OAuthServerModuleOptions>({
  meta: {
    name: 'oauth-server',
    configKey: 'oAuthServer',
  },
  defaults: {
    jwtPublicKey: '',
    jwtPrivateKey: '',
    uiBase: '/app/admin/oauth',
    apiBase: '/api/admin/oauth',
  },
  async setup(moduleOptions, nuxt) {
    const { resolve } = resolver

    nuxt.options.oAuthServer ||= {} as OAuthServerModuleOptions
    nuxt.options.runtimeConfig.oAuthServer ||= {} as OAuthServerModuleOptions

    nuxt.options.runtimeConfig.oAuthServer = defu(
      nuxt.options.runtimeConfig.oAuthServer,
      nuxt.options.oAuthServer,
      moduleOptions,
    ) as OAuthServerModuleOptions

    nuxt.options.runtimeConfig.public.oAuthServer = objectPick(
      nuxt.options.runtimeConfig.oAuthServer,
      ['uiBase', 'apiBase'],
    ) as OAuthServerModulePublicOptions

    // App
    extendPages((pages) => {
      if (pages.some(p => p.path === '/authorize')) {
        if (nuxt.options.dev) {
          console.warn('OAuth server: /authorize route already exists. Skipping.')
        }
        return
      }

      pages.push({
        name: 'oauth-authorize',
        path: '/authorize',
        file: resolve('./runtime/app/pages/authorize.vue'),
      })
    })

    await setup(nuxt, resolver)
  },
})
