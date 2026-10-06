import {
  addComponent,
  addImports,
  addPlugin,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import { registerModule } from '@frigear-nu/module-kit/utils'
import type { MenuItem, ModuleOptions } from './types'
import type {} from './schema'

export type {
  MenuItem,
  Menu,
  MenuSource,
  MenuContentSourceOptions,
  ModuleOptions,
} from './types'
export type { ResolvedMenuContentSource } from './schema'

const DEFAULT_CONTENT_COLLECTION = 'config'
const DEFAULT_CONTENT_FIELD = 'navigation'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/menus', configKey: 'menus' },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/menus', nuxt)

    const resolver = createResolver(import.meta.url)

    addImports([
      { name: 'useMenu', from: resolver.resolve('./runtime/app/composables/useMenu') },
      { name: 'extendMenuItem', from: resolver.resolve('./runtime/app/utils/extend') },
    ])

    addComponent({ name: 'MenuBar', filePath: resolver.resolve('./runtime/app/components/MenuBar.vue') })
    addComponent({ name: 'MenuCards', filePath: resolver.resolve('./runtime/app/components/MenuCards.vue') })

    // `@nuxt/content` is an optional integration: only resolved/required for menus that
    // explicitly opt into the content-backed source, mirroring `@frigear-nu/notify`'s `@nuxt/ui`
    // driver. Resolve configured sources into the plain `{ collection, field }` shape consumed by
    // `useMenu`, and surface them via public runtime config so the client knows which menus to
    // query content for.
    const contentEntries = Object.entries(options.content ?? {})
    if (contentEntries.length > 0 && !hasNuxtModule('@nuxt/content')) {
      throw new Error('[@frigear-nu/menus] `content` is configured for one or more menus, but `@nuxt/content` module is not installed. Please install @nuxt/content or remove the `content` option.')
    }

    nuxt.options.runtimeConfig.public.menus = {
      content: Object.fromEntries(
        contentEntries.map(([menu, source]) => {
          const explicit = typeof source === 'object' ? source : undefined
          return [
            menu,
            {
              collection: explicit?.collection ?? DEFAULT_CONTENT_COLLECTION,
              field: explicit?.field ?? DEFAULT_CONTENT_FIELD,
            },
          ]
        }),
      ),
    }

    addTypeTemplate({
      filename: 'types/menus-sources.d.ts',
      getContents: () => `declare module '#menus/sources' {
  import type { MenuItem, MenuSource } from ${JSON.stringify(resolver.resolve('./types'))}
  export const staticItems: Record<string, Record<string, MenuItem[]>>
  export const sources: Array<{ menu: string, source: MenuSource }>
}
`,
    })

    // Every Frigear module that wants to contribute menu items either calls `extendMenu` directly
    // during its own `setup()` (static items, collected into `nuxt.options.menus._extensions`) or
    // registers a `runtime/menus.ts` source file via `registerMenuSource` (dynamic items, needing
    // runtime context like `useRuntimeConfig`). Registration order between modules doesn't
    // matter, since both are only read once every module has finished setting up.
    nuxt.hook('modules:done', () => {
      const staticItems = nuxt.options.menus?._extensions ?? {}
      const sources = Array.isArray(nuxt.options.menus?._sources) ? nuxt.options.menus._sources : []

      const sourcesTemplate = addTemplate({
        filename: '#menus/sources.mjs',
        write: true,
        getContents: () => `
export const staticItems = ${JSON.stringify(staticItems)}
${sources.map((source, index) => `import source${index} from ${JSON.stringify(source.file)}`).join('\n')}
export const sources = [${sources.map((source, index) => `{ menu: ${JSON.stringify(source.menu)}, source: source${index} }`).join(', ')}]
`,
      })

      nuxt.options.alias['#menus/sources'] = sourcesTemplate.dst

      nuxt.callHook('menus:resolved', staticItems as Record<string, Record<string, MenuItem[]>>)
    })

    addPlugin(resolver.resolve('./runtime/app/plugins/menus'))
  },
})
