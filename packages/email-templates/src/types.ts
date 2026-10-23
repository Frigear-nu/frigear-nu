import type { EmailTemplatesRuntimeConfig } from './runtime/types'

export type {
  EmailTemplates,
  EmailTemplateName,
  EmailTemplateProps,
  EmailTemplateFile,
  EmailTemplatesRuntimeConfig,
  RenderedEmailTemplate,
} from './runtime/types'

/** Branding for the shared components (`@frigear-nu/email-templates/components`). All of it can be set at runtime too. */
export type ModuleOptions = {
  /** Logo alt text, and the header text when there is no logo. Default `'Frigear'`. */
  brandName?: string
  /** Logo in the header: absolute, or a path resolved against `siteUrl`. No logo when unset. */
  logoUrl?: string
  /** Base URL for a relative `logoUrl`. */
  siteUrl?: string
  /** Button and alert colours. Default `#2563eb` / `#dc2626`. */
  colors?: Partial<EmailTemplatesRuntimeConfig['colors']>
}
