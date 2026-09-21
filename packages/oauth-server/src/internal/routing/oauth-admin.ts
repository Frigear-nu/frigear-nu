import type { Resolver } from '@nuxt/kit'
import { addServerHandler } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

export const setupAdminOAuthApiRoutes = (nuxt: Nuxt, resolver: Resolver) => {
  const { resolve } = resolver
  addServerHandler({
    method: 'get',
    route: '/api/admin/websites',
    handler: resolve('./runtime/server/routes/api/admin/websites.get.ts'),
  })

  addServerHandler({
    method: 'get',
    route: '/api/admin/oauth/clients',
    handler: resolve('./runtime/server/routes/api/admin/oauth/clients/index.get.ts'),
  })

  addServerHandler({
    method: 'post',
    route: '/api/admin/oauth/clients',
    handler: resolve('./runtime/server/routes/api/admin/oauth/clients/index.post.ts'),
  })

  addServerHandler({
    method: 'get',
    route: '/api/admin/oauth/clients/:id',
    handler: resolve('./runtime/server/routes/api/admin/oauth/clients/[id].get.ts'),
  })

  addServerHandler({
    method: 'patch',
    route: '/api/admin/oauth/clients/:id',
    handler: resolve('./runtime/server/routes/api/admin/oauth/clients/[id].patch.ts'),
  })

  addServerHandler({
    method: 'delete',
    route: '/api/admin/oauth/clients/:id',
    handler: resolve('./runtime/server/routes/api/admin/oauth/clients/[id].delete.ts'),
  })

  addServerHandler({
    method: 'post',
    route: '/api/admin/oauth/clients/:id/secret',
    handler: resolve('./runtime/server/routes/api/admin/oauth/clients/[id]/secret.post.ts'),
  })
}
