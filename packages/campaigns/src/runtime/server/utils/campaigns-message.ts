import type { EmailNotification } from '@frigear-nu/notify/types'
import { renderMarkdown } from '@frigear-nu/ui/markdown'
import type { CampaignContent, CampaignKind } from '../../../types'
import { campaignUnsubscribeHeaders, rewriteCampaignLinks } from '../../utils/delivery'
import { translate } from '../../utils'

// What one recipient of a campaign gets: the texts in their language, every tracked link rewritten to its short link
// with the delivery token, the unsubscribe and preferences links, the `List-Unsubscribe` headers and, with
// `trackOpens`, the open pixel.

type FooterTexts = { footer: string, unsubscribe: string, preferences: string, smsStop: string }

const FOOTERS: Record<CampaignKind, Record<'en' | 'da', FooterTexts>> = {
  newsletter: {
    en: { footer: 'You get this because you signed up for it.', unsubscribe: 'Unsubscribe', preferences: 'Your newsletters', smsStop: 'Unsubscribe' },
    da: { footer: 'Du får dette, fordi du har tilmeldt dig.', unsubscribe: 'Afmeld', preferences: 'Dine nyhedsbreve', smsStop: 'Afmeld' },
  },
  message: {
    en: { footer: 'You get this because you have an account here.', unsubscribe: 'Stop these emails', preferences: 'Notification settings', smsStop: 'Stop' },
    da: { footer: 'Du får dette, fordi du har en konto her.', unsubscribe: 'Stop disse e-mails', preferences: 'Indstillinger for notifikationer', smsStop: 'Stop' },
  },
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type CampaignsRecipientLinks = {
  /** The short URL (with the delivery token) of a tracked link, or nothing to keep the link as written. */
  link: (url: string) => string | null | undefined
  /** The unsubscribe page with the token (the link in the footer and the SMS). */
  unsubscribeUrl: string | null
  /** The one-click unsubscribe route with the token (`List-Unsubscribe`). */
  oneClickUrl: string
  /** The newsletters page or the notification settings page. */
  preferencesUrl: string | null
  /** The open pixel, only with `trackOpens`. */
  pixelUrl: string | null
}

export type CampaignsMessageInput = {
  kind: CampaignKind
  content: CampaignContent
  /** The recipient's language. */
  locale: string
  /** The campaign's language, for texts missing in the recipient's. */
  fallbackLocale: string | null
  links: CampaignsRecipientLinks
  meta: Record<string, unknown>
}

const languageOf = (locale: string): 'en' | 'da' => /^da(?:[-_]|$)/i.test(locale) ? 'da' : 'en'

/** The email of one recipient (`to` is set by the caller): the `campaigns-message` template, with a plain HTML fallback. */
export function buildCampaignsEmail(input: CampaignsMessageInput): Omit<EmailNotification, 'to'> {
  const { locale, links } = input
  const texts = FOOTERS[input.kind][languageOf(locale)]
  const subject = translate(input.content.email?.subject, locale, input.fallbackLocale ?? undefined)
  const markdown = rewriteCampaignLinks(translate(input.content.email?.body, locale, input.fallbackLocale ?? undefined), links.link)
  // Escapes everything, then allows bold, italics, links (http(s), paths, mailto) and paragraphs.
  const bodyHtml = renderMarkdown(markdown)
  const footerLinks = [
    links.unsubscribeUrl ? `<a href="${escapeHtml(links.unsubscribeUrl)}">${escapeHtml(texts.unsubscribe)}</a>` : '',
    links.preferencesUrl ? `<a href="${escapeHtml(links.preferencesUrl)}">${escapeHtml(texts.preferences)}</a>` : '',
  ].filter(Boolean).join(' &middot; ')
  const pixel = links.pixelUrl ? `<img src="${escapeHtml(links.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0">` : ''
  return {
    subject,
    body: `${bodyHtml}<hr><p><small>${escapeHtml(texts.footer)}</small></p>${footerLinks ? `<p><small>${footerLinks}</small></p>` : ''}${pixel}`,
    text: [
      markdown,
      texts.footer,
      links.unsubscribeUrl ? `${texts.unsubscribe}: ${links.unsubscribeUrl}` : '',
      links.preferencesUrl ? `${texts.preferences}: ${links.preferencesUrl}` : '',
    ].filter(Boolean).join('\n\n'),
    headers: campaignUnsubscribeHeaders(links.oneClickUrl),
    template: {
      name: 'campaigns-message',
      props: {
        subject,
        bodyHtml,
        footer: texts.footer,
        unsubscribeUrl: links.unsubscribeUrl,
        unsubscribeLabel: texts.unsubscribe,
        preferencesUrl: links.preferencesUrl,
        preferencesLabel: texts.preferences,
        pixelUrl: links.pixelUrl,
      },
      locale,
    },
    meta: input.meta,
  }
}

/** The SMS of one recipient: the text with its links rewritten, and a line with the unsubscribe page. */
export function buildCampaignsSms(input: CampaignsMessageInput): string {
  const texts = FOOTERS[input.kind][languageOf(input.locale)]
  const body = rewriteCampaignLinks(translate(input.content.sms?.body, input.locale, input.fallbackLocale ?? undefined), input.links.link)
  return input.links.unsubscribeUrl ? `${body}\n\n${texts.smsStop}: ${input.links.unsubscribeUrl}` : body
}

/** The push notification of one recipient; its URL becomes the tracked short link when it is one. */
export function buildCampaignsPush(input: CampaignsMessageInput): { title: string, body: string, url?: string } {
  const push = input.content.push
  const url = push?.url ? (input.links.link(push.url) ?? push.url) : undefined
  return {
    title: translate(push?.title, input.locale, input.fallbackLocale ?? undefined),
    body: translate(push?.body, input.locale, input.fallbackLocale ?? undefined),
    ...(url ? { url } : {}),
  }
}
