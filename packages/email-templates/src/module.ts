import {
  addServerImportsDir,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  updateTemplates,
} from '@nuxt/kit'
import { inlineModuleRuntime, registerModule } from '@frigear-nu/module-kit/utils'
import { defu } from 'defu'
import type { EmailTemplateSource } from '@frigear-nu/notify/types'
import { layerTemplateDirs, mergeTemplates, templatesVirtualModule } from './templates'
import type { EmailTemplatesRuntimeConfig, ModuleOptions } from './types'

export type {
  ModuleOptions,
  EmailTemplates,
  EmailTemplateName,
  EmailTemplateProps,
  EmailTemplatesRuntimeConfig,
  RenderedEmailTemplate,
} from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    emailTemplates?: ModuleOptions
  }
  interface RuntimeConfig {
    emailTemplates: EmailTemplatesRuntimeConfig
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/email-templates', configKey: 'emailTemplates' },
  defaults: {},
  moduleDependencies: {
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/notify': { version: '>=0.1.0' },
    // Keeps Shiki (`ECodeBlock`) out of the server bundle unless the host turns it back on.
    'nuxt-email-renderer': { version: '>=2.11.0', defaults: { codeHighlighting: false } },
  },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/email-templates', nuxt)
    const resolver = createResolver(import.meta.url)

    // Branding read by the shared components at render time; options seed it, NUXT_EMAIL_TEMPLATES_* override it.
    const runtimeConfig = nuxt.options.runtimeConfig as { emailTemplates?: Partial<EmailTemplatesRuntimeConfig> }
    runtimeConfig.emailTemplates = defu(runtimeConfig.emailTemplates, {
      brandName: options.brandName ?? 'Frigear',
      logoUrl: options.logoUrl ?? '',
      siteUrl: options.siteUrl ?? '',
      colors: { primary: options.colors?.primary ?? '#2563eb', danger: options.colors?.danger ?? '#dc2626' },
    })

    // The shared building blocks, importable from any template (host, layer or module) whether or not
    // the package resolves from that file's location. Nuxt aliases reach Nitro and the generated tsconfig paths.
    nuxt.options.alias['@frigear-nu/email-templates/components'] = resolver.resolve('./runtime/components')

    // Directories of templates other modules ship. Resolved lazily so modules set up after this
    // one can still register theirs.
    const collectModuleDirs = async () => {
      const sources: EmailTemplateSource[] = []
      await nuxt.callHook('notify:email:templates', sources)
      return [...new Set(sources.map(source => source.dir))]
    }
    const collectTemplates = async () => mergeTemplates(await collectModuleDirs(), layerTemplateDirs(nuxt))

    // nuxt-email-renderer only reads the layers' directories, so replace its `#email-templates` with
    // one that has the module templates underneath them. Registered once every module is set up, so
    // it runs after the renderer's own `nitro:config` hook whatever the module order.
    // TODO: switch to an upstream option/hook for extra template directories once nuxt-email-renderer has one.
    nuxt.hook('modules:done', () => {
      nuxt.hook('nitro:config', async (nitroConfig) => {
        const moduleDirs = await collectModuleDirs()
        nitroConfig.virtual ||= {}
        nitroConfig.virtual['#email-templates'] = templatesVirtualModule(mergeTemplates(moduleDirs, layerTemplateDirs(nuxt)))
        // Published modules ship their templates inside node_modules: bundle them so the Vue plugin compiles them.
        nitroConfig.externals ||= {}
        nitroConfig.externals.inline = [...(nitroConfig.externals.inline ?? []), ...moduleDirs]
      })
    })

    if (nuxt.options.dev) {
      const moduleDirs = await collectModuleDirs()
      nuxt.options.watch.push(...moduleDirs.map(dir => `${dir}/**/*.vue`))
      // A template added or removed changes the generated names; the renderer restarts the server for the bundle.
      nuxt.hook('builder:watch', async (event, path) => {
        if ((event === 'add' || event === 'unlink') && path.endsWith('.vue')) {
          await updateTemplates({ filter: template => template.filename === 'types/email-templates.d.ts' })
        }
      })
    }

    addTypeTemplate({
      filename: 'types/email-templates.d.ts',
      getContents: async () => {
        const templates = Object.values(await collectTemplates())
        // Augments the runtime types file itself (not the package entry, which only re-exports it).
        const types = JSON.stringify(resolver.resolve('./runtime/types'))
        return `import type { TemplateComponentProps } from ${types}

declare module ${types} {
  interface EmailTemplates {
${templates.map(template => `    ${JSON.stringify(template.name)}: TemplateComponentProps<typeof import(${JSON.stringify(template.filePath)}).default>`).join('\n')}
  }
}
`
      },
    }, { nitro: true, nuxt: true })

    // Ambient (no imports), so it declares the virtual module rather than augmenting one.
    addTypeTemplate({
      filename: 'types/email-templates-virtual.d.ts',
      getContents: () => `declare module '#email-templates' {
  export const emailTemplates: Record<string, import('vue').Component>
  export const emailTemplateMapping: Record<string, import(${JSON.stringify(resolver.resolve('./runtime/types'))}).EmailTemplateFile>
}
`,
    }, { nitro: true, nuxt: true })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/notify-email'))
    inlineModuleRuntime(nuxt, resolver)
  },
})
