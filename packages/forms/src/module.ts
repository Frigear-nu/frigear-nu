import {
  addComponent,
  addComponentsDir,
  addImports,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  addModuleRoutes,
} from '@frigear-nu/module-kit/utils'
import { adminRoute } from '@frigear-nu/admin/utils'
import { addAuthScope } from '@frigear-nu/auth/utils'
import { addMcpDefinitions } from '@frigear-nu/mcp/utils'
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
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/mcp': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/notify': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // The admin pages only exist with the admin shell; its page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    addAuthScope(nuxt,
      { name: 'forms:manage', description: 'Manage forms and submissions (staff)' },
      { name: 'forms:submit', description: 'Submit forms as you', aggregateTo: ['user'] },
      { name: 'forms:pii', description: 'See submission answers and file names through MCP tools (also needs forms:manage)' },
    )
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    const formPath = resolvePagePath(settings.pages?.form, '/forms/:slug')
    // The admin pages are built from the components of `@frigear-nu/admin`, so they only exist with it.
    const withAdmin = hasNuxtModule('@frigear-nu/admin')
    const adminPage = (setting: string | boolean | undefined, ...segments: string[]) =>
      withAdmin ? resolvePagePath(setting, adminRoute(nuxt, 'forms', ...segments)) : undefined
    const adminPath = adminPage(settings.pages?.admin)
    const adminFormPath = adminPage(settings.pages?.adminForm, ':id')
    const adminSubmissionsPath = adminPage(settings.pages?.adminSubmissions, ':id', 'submissions')
    const adminSubmissionPath = adminPage(settings.pages?.adminSubmission, ':id', 'submissions', ':submissionId')

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
    // The fallback encryption key. nuxt-auth-utils 0.6 no longer declares `session.password`, and Nuxt only lets
    // `NUXT_SESSION_PASSWORD` override a key declared at build time.
    const withSession = nuxt.options.runtimeConfig as { session?: { password?: string } }
    withSession.session ??= {}
    withSession.session.password ??= ''
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
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    // Staff routes. The static `import` and `submissions` segments win over `:id` in h3's radix router, so
    // `/api/admin/forms/import` and `/api/admin/forms/submissions/:id` never reach the `:id` handlers.
    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'admin/forms.get' },
      { method: 'post', path: '', file: 'admin/forms.post' },
      { method: 'post', path: 'import', file: 'admin/import.post' },
      { method: 'get', path: 'submissions/:id', file: 'admin/submission.get' },
      { method: 'get', path: 'submissions/:id/files/:fileId', file: 'admin/submission-file.get' },
      { method: 'post', path: 'submissions/:id/redeliver', file: 'admin/submission-redeliver.post' },
      { method: 'get', path: ':id', file: 'admin/form.get' },
      { method: 'patch', path: ':id', file: 'admin/form.patch' },
      { method: 'delete', path: ':id', file: 'admin/form.delete' },
      { method: 'post', path: ':id/clone', file: 'admin/form-clone.post' },
      { method: 'get', path: ':id/submissions', file: 'admin/submissions.get' },
      { method: 'get', path: ':id/tokens', file: 'admin/form-tokens.get' },
      { method: 'post', path: ':id/tokens', file: 'admin/form-tokens.post' },
      { method: 'delete', path: ':id/tokens/:tokenId', file: 'admin/form-token.delete' },
      { method: 'get', path: ':id/password', file: 'admin/form-password.get' },
      { method: 'put', path: ':id/password', file: 'admin/form-password.put' },
      { method: 'delete', path: ':id/password', file: 'admin/form-password.delete' },
      { method: 'get', path: ':id/secrets', file: 'admin/form-secrets.get' },
      { method: 'put', path: ':id/secrets/:key', file: 'admin/form-secret.put' },
      { method: 'delete', path: ':id/secrets/:key', file: 'admin/form-secret.delete' },
    ], { base: '/api/admin/forms' })
    // Public routes.
    addModuleRoutes(resolver, [
      { method: 'get', path: ':slug', file: 'public/form.get' },
      { method: 'get', path: ':slug/access', file: 'public/access.get' },
      { method: 'post', path: ':slug/submit', file: 'public/submit.post' },
    ], { base: '/api/forms' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    if (settings.mcp === true) addMcpDefinitions(nuxt, resolver.resolve('./runtime/server/mcp'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/encryption'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/staff-scopes'))
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
      { name: 'useFormActions', from: resolver.resolve('./runtime/app/composables/useFormActions') },
      { name: 'FORMS_LIST_KEY', from: resolver.resolve('./runtime/app/composables/useFormActions') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
    // Global so MDC (Nuxt Content) resolves `::form-embed{slug="..."}` in any collection without a local wrapper.
    addComponent({ name: 'FormEmbed', filePath: resolver.resolve('./runtime/app/components/FormEmbed.vue'), global: true })

    // Pages are opt-in (they require `@nuxt/ui` in the consuming app).
    addModulePages(MODULE_NAME, resolver, [
      { name: 'forms-form', path: formPath, file: './runtime/app/pages/form.vue' },
      { name: 'forms-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'forms-admin-form', path: adminFormPath, file: './runtime/app/pages/admin-form.vue' },
      { name: 'forms-admin-submissions', path: adminSubmissionsPath, file: './runtime/app/pages/admin-submissions.vue' },
      { name: 'forms-admin-submission', path: adminSubmissionPath, file: './runtime/app/pages/admin-submission.vue' },
    ])

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin.nav' })
  },
})
