import {
  addComponent,
  addImports,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { registerModule, registerTailwindSource } from '@frigear-nu/module-kit/utils'
import type { ModuleOptions, RegisteredWidget } from './types'
import { sortWidgets } from './runtime/utils/sort'

export type { WidgetDefinition, RegisteredWidget, WidgetMeta, ModuleOptions } from './types'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/widget', configKey: 'widgets' },
  setup(_options, nuxt) {
    registerModule('@frigear-nu/widget', nuxt)

    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    addImports([
      { name: 'useWidgets', from: resolver.resolve('./runtime/app/composables/useWidgets') },
    ])
    addComponent({ name: 'WidgetArea', filePath: resolver.resolve('./runtime/app/components/WidgetArea.vue') })

    addTypeTemplate({
      filename: 'types/widgets-registry.d.ts',
      getContents: () => `declare module '#widgets/registry' {
  import type { Component } from 'vue'
  import type { WidgetMeta } from ${JSON.stringify(resolver.resolve('./types'))}
  export const widgets: Record<string, Array<WidgetMeta & { component: () => Promise<{ default: Component }> }>>
}
`,
    })

    // Widgets are only read once every module has finished setting up, so registration order doesn't matter.
    // Components are imported lazily, so an area only ships the widgets it renders.
    nuxt.hook('modules:done', () => {
      const areas: Record<string, RegisteredWidget[]> = nuxt.options.widgets?._extensions ?? {}

      const registry = addTemplate({
        filename: '#widgets/registry.mjs',
        write: true,
        getContents: () => {
          const entries = Object.entries(areas).map(([area, widgets]) => {
            const items = sortWidgets(widgets).map(({ component, ...meta }) =>
              `{ ...${JSON.stringify(meta)}, component: () => import(${JSON.stringify(component)}) }`)
            return `${JSON.stringify(area)}: [${items.join(', ')}]`
          })
          return `export const widgets = { ${entries.join(', ')} }\n`
        },
      })

      nuxt.options.alias['#widgets/registry'] = registry.dst

      nuxt.callHook('widgets:resolved', areas)
    })
  },
})
