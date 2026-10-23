import type { AllowedComponentProps, VNodeProps } from 'vue'

/**
 * Template name -> props. Augmented by `.nuxt/types/email-templates.d.ts` from every template the
 * renderer will see: module templates (`notify:email:templates`) and the host's/layers' `app/emails`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EmailTemplates {}

export type EmailTemplateName = keyof EmailTemplates & string
export type EmailTemplateProps<N extends EmailTemplateName> = EmailTemplates[N]

/** The props a template component declares (same as nuxt-email-renderer's `ExtractComponentProps`). */
export type TemplateComponentProps<TComponent> = TComponent extends new () => { $props: infer P }
  ? Omit<P, keyof VNodeProps | keyof AllowedComponentProps>
  : never

/** A scanned template file. Same shape as nuxt-email-renderer's template mapping entries. */
export type EmailTemplateFile = {
  name: string
  filename: string
  displayName: string
  importPath: string
  filePath: string
}

export type RenderedEmailTemplate = {
  /** From the template's `<ESubject>`, when it has one. */
  subject?: string
  /** HTML body. */
  body: string
  /** Plain-text body, unless rendering it was turned off. */
  text?: string
}

/** Private `runtimeConfig.emailTemplates`, overridable through `NUXT_EMAIL_TEMPLATES_*` env vars. */
export type EmailTemplatesRuntimeConfig = {
  /** `NUXT_EMAIL_TEMPLATES_BRAND_NAME`: logo alt text, and the header when there is no logo. */
  brandName: string
  /** `NUXT_EMAIL_TEMPLATES_LOGO_URL`: absolute, or a path resolved against `siteUrl` (e.g. `/logo.png`). */
  logoUrl: string
  /** `NUXT_EMAIL_TEMPLATES_SITE_URL`: base URL for a relative `logoUrl`. */
  siteUrl: string
  colors: {
    /** `NUXT_EMAIL_TEMPLATES_COLORS_PRIMARY`: buttons. */
    primary: string
    /** `NUXT_EMAIL_TEMPLATES_COLORS_DANGER`: security alerts. */
    danger: string
  }
}
