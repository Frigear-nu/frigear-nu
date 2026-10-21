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
