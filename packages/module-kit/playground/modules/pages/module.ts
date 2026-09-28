import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { addModuleServerRoute, extendModulePages, registerModule } from '../../../src/runtime/utils'

const moduleName = 'module-kit-playground'
export default defineNuxtModule({
  meta: {
    name: moduleName,
    configKey: 'moduleKitPlayground',
  },
  moduleDependencies: {
    '@frigear-nu/module-kit': {},
  },
  defaults: {},
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)
    // Module setup logic here
    registerModule(moduleName, _nuxt)

    extendModulePages(moduleName, (pages) => {
      pages.push({
        path: '/hello',
        file: resolver.resolve('./app/pages/hello-page.vue'),
      })

      pages.push({
        path: 'hello', // should become ${moduleName}/hello
        file: resolver.resolve('./app/pages/hello-page.vue'),
      })
    })
    // Should be mounted on /api/${moduleName}/hello
    addModuleServerRoute(moduleName, 'hello', {
      method: 'get',
      handler: resolver.resolve('./server/api/hello.ts'),
    })
  },
})
