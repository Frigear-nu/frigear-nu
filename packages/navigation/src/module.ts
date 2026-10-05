import {
  addImports,
  addPlugin,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import type { ModuleOptions } from './types'

export type { NavigationItem, NavigationFile, ModuleOptions } from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    navigation?: ModuleOptions
  }

  interface NuxtOptions {
    navigation?: ModuleOptions & { _files?: string[] }
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/navigation', configKey: 'navigation' },
  async setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)

    addImports([
      { name: 'useNavigation', from: resolver.resolve('./runtime/app/composables/useNavigation') },
      { name: 'extendNavigationItem', from: resolver.resolve('./runtime/app/utils/extend') },
    ])

    addTypeTemplate({
      filename: 'types/navigation-files.d.ts',
      getContents: () => `declare module '#navigation/files' {
  import type { NavigationFile } from ${JSON.stringify(resolver.resolve('./types'))}
  const files: NavigationFile[]
  export default files
}
`,
    })

    // Every Frigear module that wants to contribute navigation tiles registers its own
    // `runtime/navigation.ts` file via `registerNavigationFile` during its own `setup()`.
    // Registration order between modules doesn't matter, since this only reads the final list
    // once every module has finished setting up, via the `modules:done` hook.
    nuxt.hook('modules:done', () => {
      const files = Array.isArray(nuxt.options.navigation?._files) ? nuxt.options.navigation._files : []

      const filesTemplate = addTemplate({
        filename: '#navigation/files.mjs',
        write: true,
        getContents: () => `
${files.map((file, index) => `import file${index} from ${JSON.stringify(file)}`).join('\n')}
export default [${files.map((_file, index) => `file${index}`).join(', ')}]
`,
      })

      nuxt.options.alias['#navigation/files'] = filesTemplate.dst
    })

    addPlugin(resolver.resolve('./runtime/app/plugins/navigation'))
  },
})
