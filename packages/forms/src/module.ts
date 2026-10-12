import {
  addComponent,
  addComponentsDir,
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  defineModulePage,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import type {
  AuthorizeContext,
  CaptchaVerifyContext,
  DeliveredContext,
  FormsRuntimeConfig,
  ModuleOptions,
  PublicModuleOptions,
  SubmittedContext,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    forms?: ModuleOptions
  }

  interface RuntimeConfig {
    forms: FormsRuntimeConfig
  }

  interface PublicRuntimeConfig {
    forms: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Staff gate (definitions, submissions, files): set `ctx.allowed = true` to let the user in. Denied by default. */
    'forms:authorize': (ctx: AuthorizeContext) => void | Promise<void>
    /**
     * A valid submission was received (and stored, unless the form has `storage: 'none'`). Deliver it
     * here (webhooks, CRM, ...); set `ctx.delivered = true` once done. Throwing marks delivery failed.
     */
    'forms:submitted': (ctx: SubmittedContext) => void | Promise<void>
    /**
     * A captcha token must be verified. Set `ctx.valid` to decide; when left `undefined` the provider's
     * siteverify endpoint is called with the configured secret key. Lets hosts and tests replace the network call.
     */
    'forms:captcha:verify': (ctx: CaptchaVerifyContext) => void | Promise<void>
    /** Delivery of a submission finished (successfully or not). */
    'forms:delivered': (ctx: DeliveredContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/forms'

function resolvePagePath(setting: string | boolean | undefined, defaultPath: string) {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'forms' },
  defaults: {
    settings: { pages: {}, rateLimit: 10, rateLimitWindowSeconds: 600 },
    seed: { enabled: false, forms: [] },
  },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.10',
      defaults: { kv: true, blob: true },
    },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/notify': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // Provides the shared page components of the admin pages (`AdminPage`, `AdminTable`, ...).
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}
    const withMenus = hasNuxtModule('@frigear-nu/menu')

    const formPath = resolvePagePath(settings.pages?.form, '/forms/:slug')
    const adminPath = resolvePagePath(settings.pages?.admin, '/admin/forms')
    const adminFormPath = resolvePagePath(settings.pages?.adminForm, '/admin/forms/:id')
    const adminSubmissionsPath = resolvePagePath(settings.pages?.adminSubmissions, '/admin/forms/:id/submissions')
    const adminSubmissionPath = resolvePagePath(settings.pages?.adminSubmission, '/admin/forms/:id/submissions/:submissionId')

    nuxt.options.runtimeConfig.forms = {
      rateLimit: settings.rateLimit ?? 10,
      rateLimitWindowSeconds: settings.rateLimitWindowSeconds ?? 600,
      seed: { enabled: options.seed?.enabled ?? false, forms: options.seed?.forms ?? [] },
      captcha: {
        turnstile: { secretKey: options.captcha?.turnstile?.secretKey ?? '' },
        recaptcha: { secretKey: options.captcha?.recaptcha?.secretKey ?? '' },
        hcaptcha: { secretKey: options.captcha?.hcaptcha?.secretKey ?? '' },
      },
      encryptionKey: options.encryptionKey ?? '',
    }
    nuxt.options.runtimeConfig.public.forms = {
      pages: {
        form: formPath,
        admin: adminPath,
        adminForm: adminFormPath,
        adminSubmissions: adminSubmissionsPath,
        adminSubmission: adminSubmissionPath,
      },
      captcha: {
        turnstile: { siteKey: options.captcha?.turnstile?.siteKey ?? '' },
        recaptcha: { siteKey: options.captcha?.recaptcha?.siteKey ?? '' },
        hcaptcha: { siteKey: options.captcha?.hcaptcha?.siteKey ?? '' },
        defaultProvider: options.captcha?.defaultProvider ?? 'turnstile',
      },
    }

    // --- Database -------------------------------------------------------------------------
    await registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    const route = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, file: string) =>
      addServerHandler({ route: `/api/forms${path}`, method, handler: resolver.resolve(`./runtime/server/routes/${file}`) })

    // Static `admin/*` segments win over `:slug` in the router.
    route('get', '/admin/forms', 'admin/forms.get')
    route('post', '/admin/forms', 'admin/forms.post')
    route('get', '/admin/forms/:id', 'admin/form.get')
    route('patch', '/admin/forms/:id', 'admin/form.patch')
    route('delete', '/admin/forms/:id', 'admin/form.delete')
    route('get', '/admin/forms/:id/submissions', 'admin/submissions.get')
    route('get', '/admin/forms/:id/tokens', 'admin/form-tokens.get')
    route('post', '/admin/forms/:id/tokens', 'admin/form-tokens.post')
    route('delete', '/admin/forms/:id/tokens/:tokenId', 'admin/form-token.delete')
    route('get', '/admin/forms/:id/password', 'admin/form-password.get')
    route('put', '/admin/forms/:id/password', 'admin/form-password.put')
    route('delete', '/admin/forms/:id/password', 'admin/form-password.delete')
    route('get', '/admin/forms/:id/secrets', 'admin/form-secrets.get')
    route('put', '/admin/forms/:id/secrets', 'admin/form-secrets.put')
    route('delete', '/admin/forms/:id/secrets/:key', 'admin/form-secret.delete')
    route('post', '/admin/import', 'admin/import.post')
    route('get', '/admin/submissions/:id', 'admin/submission.get')
    route('get', '/admin/submissions/:id/files/:fileId', 'admin/submission-file.get')
    route('post', '/admin/submissions/:id/redeliver', 'admin/submission-redeliver.post')
    route('get', '/:slug', 'public/form.get')
    route('get', '/:slug/access', 'public/access.get')
    route('post', '/:slug/submit', 'public/submit.post')

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/encryption'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/email-delivery'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/seed'))

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useForm', from: resolver.resolve('./runtime/app/composables/useForms') },
      { name: 'useFormAccess', from: resolver.resolve('./runtime/app/composables/useForms') },
      { name: 'FORM_PASSWORD_HEADER', from: resolver.resolve('./runtime/app/composables/useForms') },
      { name: 'useFormsLocale', from: resolver.resolve('./runtime/app/composables/useForms') },
      { name: 'useFormsLocales', from: resolver.resolve('./runtime/app/composables/useForms') },
      { name: 'useFormsPaths', from: resolver.resolve('./runtime/app/composables/useForms') },
      { name: 'useFormLink', from: resolver.resolve('./runtime/app/composables/useForms') },
      { name: 'useFormStepper', from: resolver.resolve('./runtime/app/composables/useFormStepper') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
    // Global so MDC (Nuxt Content) resolves `::form-embed{slug="..."}` in any collection without a local wrapper.
    addComponent({ name: 'FormEmbed', filePath: resolver.resolve('./runtime/app/components/FormEmbed.vue'), global: true })

    // Pages are opt-in (they require `@nuxt/ui` in the consuming app).
    const pages = [
      { name: 'forms-form', path: formPath, file: 'form.vue' },
      { name: 'forms-admin', path: adminPath, file: 'admin.vue' },
      { name: 'forms-admin-form', path: adminFormPath, file: 'admin-form.vue' },
      { name: 'forms-admin-submissions', path: adminSubmissionsPath, file: 'admin-submissions.vue' },
      { name: 'forms-admin-submission', path: adminSubmissionPath, file: 'admin-submission.vue' },
    ]
    if (pages.some(page => page.path)) {
      extendPages((existing) => {
        const taken = new Set(existing.map(page => page.path))
        for (const page of pages) {
          if (page.path && !taken.has(page.path)) {
            existing.push(defineModulePage(MODULE_NAME, { name: page.name, path: page.path, file: resolver.resolve(`./runtime/app/pages/${page.file}`) }))
          }
        }
      })
    }

    if (withMenus) {
      const { registerMenuSource } = await import('@frigear-nu/menu/utils')
      registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard.account' })
    }
  },
})
