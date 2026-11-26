import type { H3Event } from 'h3'
import type { EmailNotification, SMSNotification } from '@frigear-nu/notify/types'
import { localizePath } from '@frigear-nu/module-kit/server'
import type { CampaignChannel, PublicModuleOptions, Translated } from '../../../types'
import { translate } from '../../utils'

// The confirmation message of a signup: an email (the `campaigns-confirm` template, with a plain fallback) or an SMS,
// in the person's language (Danish or English built in), through notify's drivers.

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type ConfirmTexts = {
  subject: string
  heading: string
  greeting: (name: string) => string
  intro: string
  button: string
  expiry: (hours: number) => string
  footer: string
  unsubscribe: string
  sms: string
}

const TEXTS: Record<'en' | 'da', ConfirmTexts> = {
  en: {
    subject: 'Confirm your subscription to {list}',
    heading: 'Confirm your subscription',
    greeting: name => name ? `Hi ${name},` : 'Hi,',
    intro: 'Someone, hopefully you, signed this address up for {list}. Confirm it, and we will start sending it to you.',
    button: 'Confirm subscription',
    expiry: hours => `The link works for ${hours} hours.`,
    footer: 'If you did not sign up, ignore this email: nothing is sent to you unless you confirm.',
    unsubscribe: 'Not me, unsubscribe',
    sms: 'Confirm your subscription to {list}: {url}',
  },
  da: {
    subject: 'Bekræft din tilmelding til {list}',
    heading: 'Bekræft din tilmelding',
    greeting: name => name ? `Hej ${name},` : 'Hej,',
    intro: 'Nogen, forhåbentlig dig, har tilmeldt denne adresse {list}. Bekræft tilmeldingen, så begynder vi at sende den til dig.',
    button: 'Bekræft tilmelding',
    expiry: hours => `Linket virker i ${hours} timer.`,
    footer: 'Hvis du ikke har tilmeldt dig, kan du se bort fra denne e-mail: vi sender ikke noget, før du bekræfter.',
    unsubscribe: 'Ikke mig, afmeld',
    sms: 'Bekræft din tilmelding til {list}: {url}',
  },
}

/** The language of the built-in texts for a locale (`da`, `da-DK` and `da_DK` are Danish); English for anything else. */
export function campaignsTextLanguage(locale: string | null | undefined): 'en' | 'da' {
  return typeof locale === 'string' && /^da(?:[-_]|$)/i.test(locale.trim()) ? 'da' : 'en'
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)

/** The absolute URL of one of the module's pages, in the person's locale, with `query`; `null` when the page is off. */
export function campaignsPageUrl(event: H3Event, page: 'confirm' | 'unsubscribe' | 'account', locale: string | null | undefined, query: Record<string, string> = {}): string | null {
  const config = useRuntimeConfig(event).public.campaigns as PublicModuleOptions | undefined
  const path = config?.pages?.[page]
  if (!path) return null
  const origin = configuredAuthSiteOrigin(event) ?? getRequestURL(event).origin
  const search = new URLSearchParams(query).toString()
  return `${origin}${localizePath(path, locale ?? undefined, config?.i18n)}${search ? `?${search}` : ''}`
}

export type CampaignsConfirmInput = {
  channel: CampaignChannel
  to: string
  name: string | null
  locale: string | null
  listName: Translated
  confirmUrl: string
  unsubscribeUrl: string | null
  ttlHours: number
}

/** The confirmation email: the `campaigns-confirm` template, and the same text as plain HTML when nothing renders it. */
export function buildCampaignsConfirmEmail(input: Omit<CampaignsConfirmInput, 'channel'>): EmailNotification {
  const language = campaignsTextLanguage(input.locale)
  const texts = TEXTS[language]
  const list = translate(input.listName, input.locale ?? language, 'en')
  const subject = fill(texts.subject, { list })
  const greeting = texts.greeting(input.name ?? '')
  const intro = fill(texts.intro, { list })
  const expiry = texts.expiry(input.ttlHours)
  const unsubscribe = input.unsubscribeUrl ? `<p><a href="${escapeHtml(input.unsubscribeUrl)}">${escapeHtml(texts.unsubscribe)}</a></p>` : ''
  return {
    to: input.to,
    subject,
    body: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(input.confirmUrl)}">${escapeHtml(texts.button)}</a></p><p>${escapeHtml(expiry)}</p><p>${escapeHtml(texts.footer)}</p>${unsubscribe}`,
    text: `${greeting}\n\n${intro}\n\n${texts.button}: ${input.confirmUrl}\n\n${expiry}\n\n${texts.footer}${input.unsubscribeUrl ? `\n\n${texts.unsubscribe}: ${input.unsubscribeUrl}` : ''}`,
    template: {
      name: 'campaigns-confirm',
      props: {
        subject,
        heading: texts.heading,
        greeting,
        intro,
        button: texts.button,
        expiry,
        footer: texts.footer,
        listName: list,
        confirmUrl: input.confirmUrl,
        unsubscribeUrl: input.unsubscribeUrl,
        unsubscribeLabel: texts.unsubscribe,
      },
      locale: input.locale ?? language,
    },
    meta: { campaigns: 'confirm' },
  }
}

/** The confirmation SMS: one line with the link. */
export function buildCampaignsConfirmSms(input: Omit<CampaignsConfirmInput, 'channel'>): SMSNotification {
  const language = campaignsTextLanguage(input.locale)
  const list = translate(input.listName, input.locale ?? language, 'en')
  return { to: input.to, body: fill(TEXTS[language].sms, { list, url: input.confirmUrl }), meta: { campaigns: 'confirm' } }
}

/** Sends the confirmation message on its channel. A failing send is logged, never shown: the answer must not differ. */
export async function campaignsSendConfirm(input: CampaignsConfirmInput): Promise<void> {
  try {
    if (input.channel === 'email') await dispatchEmailNotification(buildCampaignsConfirmEmail(input))
    else await dispatchSMSNotification(buildCampaignsConfirmSms(input))
  }
  catch (error) {
    console.error(`[campaigns] the ${input.channel} confirmation could not be sent`, error)
  }
}
