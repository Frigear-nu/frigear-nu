import type { Resolver } from '@nuxt/kit'
import { addServerHandler, addServerImportsDir } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

export const setupServerOauthRoutes = (nuxt: Nuxt, resolver: Resolver) => {
  const { resolve } = resolver

  // Server
  addServerImportsDir([
    resolve('./runtime/server/utils'),
  ])

  // OAuth
  addServerHandler({
    method: 'get',
    route: '/.well-known/jwks.json',
    handler: resolve('./runtime/server/routes/.well-known/jwks.json.get.ts'),
  })

  addServerHandler({
    method: 'get',
    route: '/.well-known/openid-configuration',
    handler: resolve('./runtime/server/routes/.well-known/openid-configuration.get.ts'),
  })

  addServerHandler({
    method: 'get',
    route: '/oauth/authorize',
    handler: resolve('./runtime/server/routes/oauth/authorize.get.ts'),
  })

  addServerHandler({
    method: 'post',
    route: '/oauth/authorize',
    handler: resolve('./runtime/server/routes/oauth/authorize.post.ts'),
  })

  addServerHandler({
    method: 'post',
    route: '/oauth/token',
    handler: resolve('./runtime/server/routes/oauth/token.post.ts'),
  })

  addServerHandler({
    method: 'post',
    route: '/oauth/revoke',
    handler: resolve('./runtime/server/routes/oauth/revoke.post.ts'),
  })

  addServerHandler({
    method: 'get',
    route: '/oauth/userinfo',
    handler: resolve('./runtime/server/routes/oauth/userinfo.get.ts'),
  })
}
