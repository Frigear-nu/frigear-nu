import {
  addImports,
  addPlugin, addServerImports,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import { addOptionalImports, defineVirtualRegistry, inlineModuleRuntime, registerModule } from '@frigear-nu/module-kit/utils'
import type { MenuItem, ModuleOptions } from './types'

export type {
  MenuItem,
  MenuFilterContext,
  Menu,
  MenuSource,
  MenuContentSourceOptions,
  ModuleOptions,
} from './types'
export type { ResolvedMenuContentSource } from './schema'

const DEFAULT_CONTENT_COLLECTION = 'config'
const DEFAULT_CONTENT_FIELD = 'navigation'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/menu', configKey: 'menus' },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/menu', nuxt)

    const resolver = createResolver(import.meta.url)

    addImports([
      { name: 'useMenu', from: resolver.resolve('./runtime/app/composables/useMenu') },
      { name: 'extendMenuItem', from: resolver.resolve('./runtime/app/utils/extend') },
    ])

    // `@nuxt/content` is an optional integration: only resolved/required for menus that
    // explicitly opt into the content-backed source, mirroring `@frigear-nu/notify`'s `@nuxt/ui`
    // driver. Resolve configured sources into the plain `{ collection, field }` shape consumed by
    // `useMenu`, and surface them via public runtime config so the client knows which menus to
    // query content for.
    const contentEntries = Object.entries(options.content ?? {})
    if (contentEntries.length > 0 && !hasNuxtModule('@nuxt/content')) {
      throw new Error('[@frigear-nu/menu] `content` is configured for one or more menus, but `@nuxt/content` module is not installed. Please install @nuxt/content or remove the `content` option.')
    }

    addOptionalImports(nuxt, '#menu/optional', [{
      name: 'queryCollection',
      available: () => hasNuxtModule('@nuxt/content', nuxt),
      fallback: `() => { throw new Error('[@frigear-nu/menu] \`@nuxt/content\` is not installed') }`,
      fallbackType: '(collection: string) => never',
    }])

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
    defineVirtualRegistry(nuxt, {
      filename: '#menus/sources.mjs',
      alias: '#menus/sources',
      collect: () => ({
        staticItems: nuxt.options.menus?._extensions ?? {},
        sources: Array.isArray(nuxt.options.menus?._sources) ? nuxt.options.menus._sources : [],
      }),
      contents: ({ staticItems, sources }) => `
export const staticItems = ${JSON.stringify(staticItems)}
${sources.map((source, index) => `import source${index} from ${JSON.stringify(source.file)}`).join('\n')}
export const sources = [${sources.map((source, index) => `{ menu: ${JSON.stringify(source.menu)}, source: source${index} }`).join(', ')}]
`,
      resolved: ({ staticItems }) => nuxt.callHook('menus:resolved', staticItems as Record<string, Record<string, MenuItem[]>>),
    })

    // The same registry for Nitro, so the server `useMenu` sees what the client does.
    defineVirtualRegistry(nuxt, {
      filename: '#menus/server-sources',
      target: 'server',
      collect: () => ({
        staticItems: nuxt.options.menus?._extensions ?? {},
        sources: Array.isArray(nuxt.options.menus?._sources) ? nuxt.options.menus._sources : [],
      }),
      contents: ({ staticItems, sources }) => `
export const staticItems = ${JSON.stringify(staticItems)}
${sources.map((source, index) => `import source${index} from ${JSON.stringify(source.file)}`).join('\n')}
export const sources = [${sources.map((source, index) => `{ menu: ${JSON.stringify(source.menu)}, source: source${index} }`).join(', ')}]
`,
    })

    addPlugin(resolver.resolve('./runtime/app/plugins/menus'))
    addServerImports({
      name: 'useMenu',
      from: resolver.resolve('./runtime/server/utils'),
      as: 'useMenu',
    })
    inlineModuleRuntime(nuxt, resolver)
  },
})
