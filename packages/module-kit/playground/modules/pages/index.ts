import { defineNuxtModule, createResolver, extendPages, addServerHandler } from '@nuxt/kit'
import {
  defineModulePage,
  moduleApiUrl,
  moduleUrl,
  registerModule,
  extendDatabaseTable,
} from '../../../src/runtime/utils'

const moduleName = 'module-kit-playground'

export type ModuleOptions = {
  db?: boolean
}
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: moduleName,
    configKey: 'moduleKitPlayground',
  },
  moduleDependencies: {
    '@frigear-nu/module-kit': {},
    '@nuxthub/core': {},
  },
  defaults: {
    db: true,
  },
  async setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)
    // Module setup logic here
    registerModule(moduleName, _nuxt)

    extendPages((pages) => {
      pages.push(defineModulePage(moduleName, {
        path: '/original/hello',
        file: resolver.resolve('./app/pages/hello-page.vue'),
      }))

      pages.push(defineModulePage(moduleName, {
        path: moduleUrl(moduleName, '/hello'), // should become /hello
        file: resolver.resolve('./app/pages/hello-page.vue'),
      }))

      pages.push(defineModulePage(moduleName, {
        path: moduleUrl(moduleName, 'hello'), // should become ${moduleName}/hello
        file: resolver.resolve('./app/pages/hello-page.vue'),
      }))
    })

    addServerHandler({
      route: moduleApiUrl(moduleName, 'hello'),
      method: 'get',
      handler: resolver.resolve('./server/api/hello.ts'),
    })

    if (_options.db) {
      await extendDatabaseTable(_nuxt, {
        name: 'users',
        factory: 'createUsersTable',
        resolver,
        schema: dialect => `server/db/users.${dialect}.ts`,
        extensionFile: dialect => `server/db/users.extend.${dialect}.ts`,
      })
    }
  },
})
