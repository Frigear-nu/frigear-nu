import {
  addComponent,
  addImports,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { defineVirtualRegistry, registerModule, registerTailwindSource } from '@frigear-nu/module-kit/utils'
import type { ModuleOptions, RegisteredTab, RegisteredWidget } from './types'
import { sortWidgets } from './runtime/utils/sort'

export type { WidgetDefinition, RegisteredWidget, WidgetMeta, TabDefinition, RegisteredTab, TabMeta, ModuleOptions } from './types'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/widget', configKey: 'widgets' },
  setup(_options, nuxt) {
    registerModule('@frigear-nu/widget', nuxt)

    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    addImports([
      { name: 'useWidgets', from: resolver.resolve('./runtime/app/composables/useWidgets') },
      { name: 'useTabs', from: resolver.resolve('./runtime/app/composables/useTabs') },
    ])
    addComponent({ name: 'WidgetArea', filePath: resolver.resolve('./runtime/app/components/WidgetArea.vue') })
    addComponent({ name: 'WidgetTabs', filePath: resolver.resolve('./runtime/app/components/WidgetTabs.vue') })

    addTypeTemplate({
      filename: 'types/widgets-registry.d.ts',
      getContents: () => `declare module '#widgets/registry' {
  import type { Component } from 'vue'
  import type { WidgetMeta } from ${JSON.stringify(resolver.resolve('./types'))}
  export const widgets: Record<string, Array<WidgetMeta & { component: () => Promise<{ default: Component }> }>>
}
declare module '#widgets/tabs' {
  import type { Component } from 'vue'
  import type { RegisteredTab } from ${JSON.stringify(resolver.resolve('./types'))}
  export const tabs: Record<string, Array<Omit<RegisteredTab, 'component'> & { component: () => Promise<{ default: Component }> }>>
}
`,
    })

    // Widgets are only read once every module has finished setting up, so registration order doesn't matter.
    // Components are imported lazily, so an area only ships the widgets it renders.
    const lazyEntries = (areas: Record<string, Array<RegisteredWidget | RegisteredTab>>) => Object.entries(areas).map(([area, entries]) => {
      const items = sortWidgets(entries).map(({ component, ...meta }) =>
        `{ ...${JSON.stringify(meta)}, component: () => import(${JSON.stringify(component)}) }`)
      return `${JSON.stringify(area)}: [${items.join(', ')}]`
    }).join(', ')

    defineVirtualRegistry(nuxt, {
      filename: '#widgets/registry.mjs',
      alias: '#widgets/registry',
      collect: (): Record<string, RegisteredWidget[]> => nuxt.options.widgets?._extensions ?? {},
      contents: areas => `export const widgets = { ${lazyEntries(areas)} }\n`,
      resolved: areas => nuxt.callHook('widgets:resolved', areas),
    })

    // Tabs are a separate list from widgets, with their own virtual module.
    defineVirtualRegistry(nuxt, {
      filename: '#widgets/tabs.mjs',
      alias: '#widgets/tabs',
      collect: (): Record<string, RegisteredTab[]> => nuxt.options.widgets?._tabs ?? {},
      contents: areas => `export const tabs = { ${lazyEntries(areas)} }\n`,
      resolved: areas => nuxt.callHook('tabs:resolved', areas),
    })
  },
})
