import type { H3Event } from 'h3'
import { resolveViewer } from '@frigear-nu/audience/server'
import { apiError, notConfigured, validationError } from '@frigear-nu/module-kit/server'
import { dispatchEmailNotification, dispatchSMSNotification, notifyAvailable } from '#help-center/optional'
import type { z } from 'zod'
import type { HelpArticleDto, HelpSendResult } from '../../../types'
import { createHelpCenterPaths, localizeHelpCenterPath } from '../../utils/paths'
import type { HelpCenterI18n } from '../../utils/paths'
import { translate } from '../../utils/index'
import { helpCenterArticleById } from './help-center'
import { loadHelpUsers } from './help-center-checklists'
import { helpCenterRequiredLocales } from './help-center-db'
import type { helpSendInput } from './help-center-schemas'

type SendInput = z.output<typeof helpSendInput>

/** The most people one send reaches. Each one's viewer is resolved so nobody gets a link to something they cannot open. */
export const HELP_SEND_MAX_RECIPIENTS = 500

/** The subject of a message with several articles, in the language of the send (English for any other). */
const SUBJECTS: Record<string, (count: number) => string> = {
  da: count => `${count} hjælpeartikler`,
  en: count => `${count} help articles`,
}
export const helpSendSubject = (locale: string, count: number) => (SUBJECTS[locale] ?? SUBJECTS.en!)(count)

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)

/**
 * The people an audience stands for: the explicit `userIds`, plus whatever `help-center:audience:resolve` listeners add
 * for `operationId`, `teamId` and `globalRoles`. The help center imports neither teams nor crew, so without a listener
 * only explicit ids resolve.
 */
export async function resolveHelpAudience(event: H3Event, audience: SendInput['audience']): Promise<string[]> {
  const userIds = (audience.userIds ?? []).map(String)
  await useNitroApp().hooks.callHook('help-center:audience:resolve', { event, audience: { ...audience }, userIds })
  return [...new Set(userIds.map(String))]
}

/**
 * Sends links to articles by email and SMS. Recipients come from the audience; each gets the articles they may read, as
 * a link into the public area (a public article) or the signed-in area. People without a readable article, or without an
 * address for the channels asked for, are skipped. The paths come from the configured areas, never hard-coded.
 */
export async function sendHelpArticles(event: H3Event, input: SendInput): Promise<HelpSendResult> {
  if (!notifyAvailable) throw notConfigured('Sending needs @frigear-nu/notify.')
  const config = useRuntimeConfig().public.helpCenter as { pages?: { public?: string, signedIn?: string }, i18n?: HelpCenterI18n | null } | undefined
  const paths = createHelpCenterPaths({ public: config?.pages?.public, signedIn: config?.pages?.signedIn })
  if (!paths.public.base && !paths.signedIn.base) throw notConfigured('Both areas of the help center are off, so there is nowhere to link to.')

  const ids = await resolveHelpAudience(event, input.audience)
  // An operation, team or role that nobody answers for is not "zero people": say that nothing listened, so a host that
  // has not installed teams or crew finds out instead of believing the message went out.
  const named = input.audience.operationId || input.audience.teamId || input.audience.globalRoles?.length
  if (!ids.length && named) {
    throw apiError(400, 'audience_not_resolved', 'Nobody answers for this audience: no help-center:audience:resolve listener (teams or crew) returned people for it. Send to explicit userIds, or install the module that knows the audience.')
  }
  if (ids.length > HELP_SEND_MAX_RECIPIENTS) {
    throw validationError([{ path: ['audience'], message: `An audience of ${ids.length} people is too many: send to at most ${HELP_SEND_MAX_RECIPIENTS} at a time.` }])
  }
  const people = await loadHelpUsers(ids)
  const requiredLocales = helpCenterRequiredLocales()
  const locale = input.locale ?? requiredLocales[0] ?? 'en'
  // The configured site, never a header the client chooses (`authSiteOrigin`).
  const origin = authSiteOrigin(event)
  const result: HelpSendResult = { recipients: ids.length, emailed: 0, texted: 0, skipped: 0 }

  for (const id of ids) {
    const person = people.get(id)
    const wantsEmail = input.channels.includes('email') && !!person?.email
    const wantsSms = input.channels.includes('sms') && !!person?.phone
    if (!person || (!wantsEmail && !wantsSms)) {
      result.skipped++
      continue
    }
    // The user as stored (numeric id, email), the way a request's own user is, so role providers and hooks see the same.
    const viewer = await resolveViewer(event, {
      hooks: useNitroApp().hooks,
      user: { id: person.user.id },
      globalRoles: await getEffectiveRoles(event, person.user as Parameters<typeof getEffectiveRoles>[1]),
    })
    const ctx = { event, viewer, requiredLocales }

    const links: Array<{ title: string, url: string }> = []
    for (const articleId of input.articleIds) {
      const article: HelpArticleDto | undefined = await helpCenterArticleById(ctx, articleId)
      if (!article) continue
      const path = article.public && paths.public.base
        ? paths.public.article(article.categorySlug, article.slug)
        : paths.signedIn.article(article.categorySlug, article.slug)
      if (path) links.push({ title: translate(article.title, locale, requiredLocales[0]), url: `${origin}${localizeHelpCenterPath(path, locale, config?.i18n)}` })
    }
    if (!links.length) {
      result.skipped++
      continue
    }

    try {
      if (wantsEmail) {
        const subject = links.length === 1 ? links[0]!.title : helpSendSubject(locale, links.length)
        await dispatchEmailNotification({
          to: person.email!,
          subject,
          body: `<p>${escapeHtml(person.name ?? '')}</p><ul>${links.map(link => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a></li>`).join('')}</ul>`,
          text: `${person.name ?? ''}\n\n${links.map(link => `${link.title}: ${link.url}`).join('\n')}`,
          template: { name: 'help-center-articles', props: { name: person.name ?? '', links }, locale },
          meta: { helpCenter: { articleIds: input.articleIds } },
        })
        result.emailed++
      }
      if (wantsSms) {
        await dispatchSMSNotification({ to: person.phone!, body: links.map(link => `${link.title}: ${link.url}`).join('\n') })
        result.texted++
      }
    }
    catch (error) {
      console.error(`[@frigear-nu/help-center] could not send articles to user ${id}:`, error)
      result.skipped++
    }
  }
  return result
}
