import type { EmailNotification } from '@frigear-nu/notify/types'
import type { EmailTemplateName, EmailTemplateProps, RenderedEmailTemplate } from '../../types'

export type RenderEmailTemplateOptions = {
  /** Locale to render with, when `@nuxtjs/i18n` is installed. */
  locale?: string
  /** Also render a plain-text body. Defaults to `true`. */
  text?: boolean
}

export type SendEmailTemplateMessage = Omit<EmailNotification, 'subject' | 'body' | 'text' | 'template'> & {
  /** Overrides the template's `<ESubject>`. Required when the template has none. */
  subject?: string
  /** A plain-text body of your own, or `false` to send HTML only. Rendered from the template by default. */
  text?: string | false
  locale?: string
}

const toParts = (rendered: string | { html: string, subject: string }) =>
  typeof rendered === 'string' ? { content: rendered, subject: undefined } : { content: rendered.html, subject: rendered.subject }

/**
 * Renders an email template (an SFC in `app/emails`, or one a module ships) to HTML, plus plain
 * text unless `text: false`. Throws a 404 error when no template has that name.
 */
export async function renderEmailTemplate<N extends EmailTemplateName>(
  name: N,
  props: EmailTemplateProps<N>,
  options: RenderEmailTemplateOptions = {},
): Promise<RenderedEmailTemplate> {
  const renderProps = props as Record<string, unknown>
  const html = toParts(await renderEmailComponent(name, renderProps, { locale: options.locale }))
  // Vue SSR logs errors thrown while rendering and leaves the markup empty rather than rejecting.
  if (!html.content.replace(/<!DOCTYPE[^>]*>/i, '').trim()) {
    throw new Error(`[@frigear-nu/email-templates] Template "${name}" rendered nothing.`)
  }
  const text = options.text === false
    ? undefined
    : toParts(await renderEmailComponent(name, renderProps, { locale: options.locale, plainText: true })).content
  return { subject: html.subject, body: html.content, text }
}

/**
 * Renders an email template and sends it through `@frigear-nu/notify`'s configured driver. The
 * subject comes from the template's `<ESubject>` unless `message.subject` is given.
 */
export async function sendEmailTemplate<N extends EmailTemplateName>(
  name: N,
  props: EmailTemplateProps<N>,
  message: SendEmailTemplateMessage,
) {
  const { subject: subjectOverride, text: textOverride, locale, ...rest } = message
  const rendered = await renderEmailTemplate(name, props, { locale, text: textOverride === undefined })
  const subject = subjectOverride ?? rendered.subject
  if (!subject) {
    throw new Error(`[@frigear-nu/email-templates] Template "${name}" has no <ESubject>; pass \`subject\` to sendEmailTemplate.`)
  }
  return dispatchEmailNotification({
    ...rest,
    subject,
    body: rendered.body,
    text: textOverride === false ? undefined : textOverride ?? rendered.text,
  })
}
