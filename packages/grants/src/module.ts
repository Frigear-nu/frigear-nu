import { addComponentsDir, addServerImportsDir, addTypeTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defineVirtualRegistry, inlineModuleRuntime, registerLocales, registerModule, registerTailwindSource } from '@frigear-nu/module-kit/utils'
import type { GrantFieldMeta, GrantKindRegistration, ModuleOptions } from './types'
import { extendGrants, registeredGrantKinds } from './runtime/utils/extend'

export type * from './types'

const MODULE_NAME = '@frigear-nu/grants'

const byOrder = (kinds: GrantKindRegistration[]) =>
  [...kinds].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.kind.localeCompare(b.kind))

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'grants' },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
  },
  setup(_options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    // The two kinds every app has. Modules add theirs with `extendGrants` (teams: `team`, operations: `operation`).
    extendGrants(nuxt, [
      {
        kind: 'public',
        label: 'Everyone',
        labelKey: 'grants.kinds.public',
        icon: 'i-lucide-globe',
        server: resolver.resolve('./runtime/server/kinds/public'),
        order: 0,
      },
      {
        kind: 'role',
        label: 'Role',
        labelKey: 'grants.kinds.role',
        icon: 'i-lucide-shield',
        server: resolver.resolve('./runtime/server/kinds/role'),
        field: resolver.resolve('./runtime/app/components/GrantRoleField.vue'),
        defaults: { role: '' },
        order: 10,
      },
    ])

    addTypeTemplate({
      filename: 'types/grants-kinds.d.ts',
      getContents: () => `declare module '#grants/kinds' {
  import type { GrantKindDefinition } from ${JSON.stringify(resolver.resolve('./types'))}
  export const kinds: GrantKindDefinition<any>[]
}
declare module '#grants/fields' {
  import type { Component } from 'vue'
  import type { GrantFieldMeta } from ${JSON.stringify(resolver.resolve('./types'))}
  export const grantFields: Array<GrantFieldMeta & { field?: () => Promise<{ default: Component }> }>
}
`,
    }, { nitro: true, nuxt: true })

    // The server half: every kind's definition (schema, matches, members), bundled once all modules are done.
    defineVirtualRegistry(nuxt, {
      filename: '#grants/kinds',
      target: 'server',
      collect: () => byOrder(registeredGrantKinds(nuxt)),
      contents: kinds => `${kinds.map((kind, index) => `import kind${index} from ${JSON.stringify(kind.server)}`).join('\n')}
export const kinds = [${kinds.map((_, index) => `kind${index}`).join(', ')}]
`,
    })

    // The client half: the editor's menu of kinds and each kind's field component, loaded on demand.
    defineVirtualRegistry(nuxt, {
      filename: '#grants/fields.mjs',
      alias: '#grants/fields',
      collect: () => byOrder(registeredGrantKinds(nuxt)),
      contents: kinds => `export const grantFields = [${kinds.map(({ server: _server, field, ...meta }) => {
        const entry: GrantFieldMeta = { ...meta, hasField: !!field }
        return field
          ? `{ ...${JSON.stringify(entry)}, field: () => import(${JSON.stringify(field)}) }`
          : JSON.stringify(entry)
      }).join(', ')}]
`,
    })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
  },
})
