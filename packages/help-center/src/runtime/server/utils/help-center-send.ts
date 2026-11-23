import type { H3Event } from 'h3'
import type { Grant } from '@frigear-nu/auth/grants'
import { apiError, localizePath, notConfigured, validationError } from '@frigear-nu/module-kit/server'
import type { LocaleRouting } from '@frigear-nu/module-kit/server'
import type { z } from 'zod'
import type { HelpArticleDto, HelpSendResult, HelpSendSkip, HelpSendSkipReason, HelpUserLookupDto } from '../../../types'
import { createHelpCenterPaths } from '../../utils/paths'
import { translate } from '../../utils/index'
import { helpCenterArticleById, helpCenterReaderFor } from './help-center'
import { loadHelpUsers } from './help-center-checklists'
import { helpCenterDeliver, helpSendEmailSkipReason, helpSendSmsSkipReason } from './help-center-deliver'
import type { HelpDelivered } from './help-center-deliver'
import { helpCenterRequiredLocales } from './help-center-db'
import type { helpSendInput } from './help-center-schemas'

type SendInput = z.output<typeof helpSendInput>

/** The most people one send reaches. Each one's grants are checked so nobody gets a link to something they cannot open. */
export const HELP_SEND_MAX_RECIPIENTS = 500

/** The subject of a message with several articles, in the language of the send (English for any other). */
const SUBJECTS: Record<string, (count: number) => string> = {
  da: count => `${count} hjælpeartikler`,
  en: count => `${count} help articles`,
}
export const helpSendSubject = (locale: string, count: number) => (SUBJECTS[locale] ?? SUBJECTS.en!)(count)

type HelpSendEmailTexts = { heading: string, greeting: (name: string) => string, intro: (count: number) => string }

/** The texts of the `help-center-articles` email in the language of the person (English for any other). */
const EMAIL_TEXTS: Record<string, HelpSendEmailTexts> = {
  da: {
    heading: 'Hjælpeartikler til dig',
    greeting: name => name ? `Hej ${name},` : 'Hej,',
    intro: count => count === 1 ? 'Tag et kig på denne artikel:' : 'Tag et kig på disse artikler:',
  },
  en: {
    heading: 'Help articles for you',
    greeting: name => name ? `Hi ${name},` : 'Hi,',
    intro: count => count === 1 ? 'Have a look at this article:' : 'Have a look at these articles:',
  },
}

/**
 * The props of the `help-center-articles` email for one person: the subject, heading, greeting and intro in their
 * language, so the template (with `@frigear-nu/email-templates`) writes in it too.
 */
export function helpSendEmailProps(locale: string, name: string, links: Array<{ title: string, url: string }>) {
  const texts = EMAIL_TEXTS[locale] ?? EMAIL_TEXTS.en!
  return {
    name,
    links,
    subject: links.length === 1 ? links[0]!.title : helpSendSubject(locale, links.length),
    heading: texts.heading,
    greeting: texts.greeting(name),
    intro: texts.intro(links.length),
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)

/**
 * The people an audience stands for: the explicit `userIds`, plus the members of every grant (`grantsMembers`: each grant
 * kind lists its own, `role` from Authorization, `team` from Teams, `operation` from the modules that know who takes
 * part). The grants are checked first: an unknown kind or a reference that does not exist is a 400, and so is a
 * `public` grant, which lists nobody.
 */
export async function resolveHelpAudience(event: H3Event, audience: SendInput['audience']): Promise<string[]> {
  const userIds = (audience.userIds ?? []).map(String)
  if (audience.grants?.length) {
    const grants = await grantsValidate(event, audience.grants as Grant[], { field: 'audience' })
    if (grants.some(grant => grant.kind === 'public')) {
      throw validationError([{ path: ['audience', 'grants'], message: 'A send cannot go to everyone: name the roles, teams or people instead.' }])
    }
    userIds.push(...await grantsMembers(event, grants))
  }
  return [...new Set(userIds)]
}

/** A person of the send form's picker: the email only for a caller with `help-center:pii`. */
export function toHelpUserLookupDto(ref: { id: number | string, name: string | null, avatar?: string | null, email?: string | null }, pii: boolean): HelpUserLookupDto {
  return { id: Number(ref.id), name: ref.name, avatar: ref.avatar ?? null, ...(pii ? { email: ref.email ?? null } : {}) }
}

/** The response of `POST /api/admin/help-center/send`: only these fields. */
export function toHelpSendResultDto(result: HelpSendResult): HelpSendResult {
  return {
    recipients: result.recipients,
    counts: { sms: result.counts.sms, email: result.counts.email, none: result.counts.none },
    fallback: result.fallback,
    pushed: result.pushed,
    skipped: result.skipped.map(({ userId, name, reason }) => ({ userId, name, reason })),
  }
}

/**
 * Sends links to articles by email and SMS. Recipients come from the audience; each gets the articles they may read, as
 * a link into the public area (a public article) or the signed-in area. With `fallbackToEmail` (on by default) a person
 * a text cannot reach (no phone number, SMS off for the topic) is emailed instead. People who get neither an email nor a
 * text are listed in `skipped` with why. The paths come from the configured areas, never hard-coded.
 */
export async function sendHelpArticles(event: H3Event, input: SendInput): Promise<HelpSendResult> {
  const config = useRuntimeConfig().public.helpCenter as { pages?: { public?: string, signedIn?: string }, i18n?: LocaleRouting | null } | undefined
  const paths = createHelpCenterPaths({ public: config?.pages?.public, signedIn: config?.pages?.signedIn })
  if (!paths.public.base && !paths.signedIn.base) throw notConfigured('Both areas of the help center are off, so there is nowhere to link to.')

  const ids = await resolveHelpAudience(event, input.audience)
  // Grants that list nobody are not a send to "zero people": say so, so the sender finds out instead of believing the
  // message went out.
  if (!ids.length) {
    throw apiError(400, 'audience_not_resolved', 'Nobody matches this audience: its grants list no people. Check the roles, teams or operations, or send to explicit userIds.')
  }
  if (ids.length > HELP_SEND_MAX_RECIPIENTS) {
    throw validationError([{ path: ['audience'], message: `An audience of ${ids.length} people is too many: send to at most ${HELP_SEND_MAX_RECIPIENTS} at a time.` }])
  }
  const people = await loadHelpUsers(ids)
  const requiredLocales = helpCenterRequiredLocales()
  // Each person gets the articles in their own language (`users.locale`); the sender's `locale` is for people without
  // one, then the first required locale, then English.
  const fallbackLocale = input.locale ?? requiredLocales[0] ?? 'en'
  // The configured site, never a header the client chooses (`authSiteOrigin`).
  const origin = authSiteOrigin(event)
  const result: HelpSendResult = { recipients: ids.length, counts: { sms: 0, email: 0, none: 0 }, fallback: 0, pushed: 0, skipped: [] }
  const skip = (userId: string, name: string | null | undefined, reason: HelpSendSkipReason) => {
    const entry: HelpSendSkip = { userId, name: name ?? null, reason }
    result.skipped.push(entry)
    result.counts.none++
  }
  const byEmail = input.channels.includes('email')
  const bySms = input.channels.includes('sms')

  for (const id of ids) {
    const person = people.get(id)
    if (!person) {
      skip(id, null, 'unknown_user')
      continue
    }
    const locale = person.locale || fallbackLocale
    // The user as stored (numeric id, email), the way a request's own user is, so role providers and grant kinds see
    // the same: each article is checked against the recipient's grants, never the sender's.
    const ctx = { event, reader: helpCenterReaderFor(event, person.user as { id: string | number }), requiredLocales }

    const links: Array<{ title: string, url: string }> = []
    for (const articleId of input.articleIds) {
      const article: HelpArticleDto | undefined = await helpCenterArticleById(ctx, articleId)
      if (!article) continue
      const path = article.public && paths.public.base
        ? paths.public.article(article.categorySlug, article.slug)
        : paths.signedIn.article(article.categorySlug, article.slug)
      if (path) links.push({ title: translate(article.title, locale, requiredLocales[0]), url: `${origin}${localizePath(path, locale, config?.i18n)}` })
    }
    if (!links.length) {
      skip(id, person.name, 'no_access')
      continue
    }

    const props = helpSendEmailProps(locale, person.name ?? '', links)
    const subject = props.subject
    const names = links.map(link => link.title).join(', ')
    const deliver = (channels: { email: boolean, sms: boolean }) => helpCenterDeliver(event, {
      userId: Number(id),
      ...channels,
      to: person.email ?? null,
      phone: person.phone ?? null,
      message: {
        subject,
        body: `<p>${escapeHtml(person.name ?? '')}</p><ul>${links.map(link => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a></li>`).join('')}</ul>`,
        text: `${person.name ?? ''}\n\n${links.map(link => `${link.title}: ${link.url}`).join('\n')}`,
        template: { name: 'help-center-articles', props, locale },
        meta: { helpCenter: { articleIds: input.articleIds } },
      },
      smsBody: links.map(link => `${link.title}: ${link.url}`).join('\n'),
      push: { title: subject, body: names.length > 200 ? `${names.slice(0, 197)}...` : names, url: links[0]!.url },
    })

    // The channels asked for, in one `notifyUser` call: it decides each by the person's choices for the topic.
    // `helpCenterDeliver` never throws.
    const first = await deliver({ email: byEmail, sms: bySms && !!person.phone })
    let emailed = first.emailed
    const texted = first.texted
    let pushed = first.pushed
    let emailOutcome: HelpDelivered | null = byEmail ? first : null
    // "Fall back to email": a text that cannot reach the person (no number, SMS off for the topic) becomes an email,
    // which still follows their email choice. A failed text is not retried by email.
    const smsReason = bySms && !texted ? helpSendSmsSkipReason(person.phone, person.phone ? first : null) : null
    if (smsReason && smsReason !== 'failed' && input.fallbackToEmail && !byEmail) {
      const second = await deliver({ email: true, sms: false })
      emailOutcome = second
      emailed = second.emailed
      pushed = pushed || second.pushed
      if (emailed) result.fallback++
    }
    if (texted) result.counts.sms++
    if (emailed) result.counts.email++
    if (pushed) result.pushed++
    // The reason of the last channel tried: the email when it was asked for or fallen back to, the text otherwise.
    if (!texted && !emailed) skip(id, person.name, emailOutcome ? helpSendEmailSkipReason(person.email, emailOutcome) : smsReason ?? 'failed')
  }
  return toHelpSendResultDto(result)
}
