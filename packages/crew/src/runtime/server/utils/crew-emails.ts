import type { H3Event } from 'h3'
import type { EmailNotification } from '@frigear-nu/notify/types'
import { localizePath } from '@frigear-nu/module-kit/server'
import type { LocaleRouting } from '@frigear-nu/module-kit/server'
import type { CrewMemberDto, CrewStatus, Translated } from '../../../types'
import { CREW_STATUS_LABELS, crewStatusPath, translate } from '../../utils'
import type { CrewPages } from '../../utils'
import type { CrewSettingsRow } from './crew-settings'
import { crewSend } from './crew-send'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type CrewStatusTexts = {
  subjects: Record<CrewStatus, string>
  messages: Record<CrewStatus, string>
  /** The `{{status}}` variable. */
  labels: Record<CrewStatus, string>
  headings: Record<CrewStatus, string>
  greeting: (name: string) => string
  /** The status page button (the rejected email has none). */
  button: Record<CrewStatus, string | null>
}

// The built-in texts, in the person's language: a da/en table, English for any other locale. An operation's own
// texts (`statusEmails`) replace the subject and the message.
const TEXTS: Record<'en' | 'da', CrewStatusTexts> = {
  en: {
    subjects: {
      applied: 'We received your application for {{operation}}',
      waitlisted: 'You are on the waiting list for {{operation}}',
      approved: 'You are on the crew of {{operation}}',
      rejected: 'Your application for {{operation}}',
      withdrawn: 'You withdrew from {{operation}}',
    },
    messages: {
      applied: 'Thank you for applying. We will get back to you once the crew has been decided.',
      waitlisted: 'The crew is full for now, so you are on the waiting list. We will let you know if a place opens up.',
      approved: 'Welcome to the crew! You are on the team {{team}}.',
      rejected: 'Thank you for applying. Unfortunately we cannot offer you a place on the crew this time.',
      withdrawn: 'You are no longer part of the crew. You can apply again while applications are open.',
    },
    labels: CREW_STATUS_LABELS,
    headings: {
      applied: 'We received your application',
      waitlisted: 'You are on the waiting list',
      approved: 'You are on the crew',
      rejected: 'About your application',
      withdrawn: 'You withdrew from the crew',
    },
    greeting: name => name ? `Hi ${name},` : 'Hi,',
    button: {
      applied: 'See your application',
      waitlisted: 'See your application',
      approved: 'See your crew status',
      rejected: null,
      withdrawn: 'See your crew status',
    },
  },
  da: {
    subjects: {
      applied: 'Vi har modtaget din ansøgning til {{operation}}',
      waitlisted: 'Du er på ventelisten til {{operation}}',
      approved: 'Du er med i crewet på {{operation}}',
      rejected: 'Din ansøgning til {{operation}}',
      withdrawn: 'Du har trukket dig fra {{operation}}',
    },
    messages: {
      applied: 'Tak for din ansøgning. Vi vender tilbage, når crewet er på plads.',
      waitlisted: 'Crewet er fuldt lige nu, så du er på ventelisten. Vi giver besked, hvis der bliver en plads ledig.',
      approved: 'Velkommen i crewet! Du er på holdet {{team}}.',
      rejected: 'Tak for din ansøgning. Desværre kan vi ikke tilbyde dig en plads i crewet denne gang.',
      withdrawn: 'Du er ikke længere med i crewet. Du kan søge igen, så længe der er åbent for ansøgninger.',
    },
    labels: {
      applied: 'Ansøgt',
      waitlisted: 'Venteliste',
      approved: 'Godkendt',
      rejected: 'Afvist',
      withdrawn: 'Trukket tilbage',
    },
    headings: {
      applied: 'Vi har modtaget din ansøgning',
      waitlisted: 'Du er på ventelisten',
      approved: 'Du er med i crewet',
      rejected: 'Om din ansøgning',
      withdrawn: 'Du har trukket dig fra crewet',
    },
    greeting: name => name ? `Hej ${name},` : 'Hej,',
    button: {
      applied: 'Se din ansøgning',
      waitlisted: 'Se din ansøgning',
      approved: 'Se din crewstatus',
      rejected: null,
      withdrawn: 'Se din crewstatus',
    },
  },
}

/** The language of the built-in texts for a locale (`da`, `da-DK` and `da_DK` are Danish); English for anything else. */
export function crewTextLanguage(locale: string | undefined | null): 'en' | 'da' {
  return typeof locale === 'string' && /^da(?:[-_]|$)/i.test(locale.trim()) ? 'da' : 'en'
}

/** `{{name}}` style variables of a status email: the person, the operation, their team and role, and the status. */
export type CrewEmailVariables = { name: string, operation: string, team: string, role: string, status: string }

const fill = (text: string, variables: CrewEmailVariables) =>
  text.replace(/\{\{\s*(name|operation|team|role|status)\s*\}\}/g, (_match, key: keyof CrewEmailVariables) => variables[key])

/**
 * A status notification: the email without its address (notify's `notifyUser` sends it to the user's own address, and
 * skips email for a user without one) and everything the push is built from.
 */
export type CrewStatusNotification = Omit<EmailNotification, 'to'>

/**
 * The notification of a status change, from the operation's own texts or the built-in ones, in the person's language
 * (`locale`; the built-in texts are Danish or English). `null` when the status is turned off. A person without an email
 * still gets one: notify then reaches them on push only.
 */
export function buildCrewStatusEmail(input: {
  status: CrewStatus
  member: Pick<CrewMemberDto, 'name' | 'teamName' | 'role'> & { email?: string | null }
  operationName: Translated
  roleLabel: string
  settings: Pick<CrewSettingsRow, 'statusEmails'> | undefined
  statusUrl?: string
  locale?: string
}): CrewStatusNotification | null {
  const { status, member, settings, statusUrl } = input
  const config = settings?.statusEmails?.[status]
  if (config?.enabled === false) return null
  const locale = input.locale ?? 'en'
  const texts = TEXTS[crewTextLanguage(locale)]
  const variables: CrewEmailVariables = {
    name: member.name ?? '',
    operation: translate(input.operationName, locale, 'en'),
    team: translate(member.teamName, locale, 'en'),
    role: input.roleLabel,
    status: texts.labels[status],
  }
  const customSubject = translate(config?.subject, locale, 'en')
  const customBody = translate(config?.body, locale, 'en')
  const subject = fill(customSubject || texts.subjects[status], variables)
  const message = fill(customBody || texts.messages[status], variables)
  const greeting = texts.greeting(variables.name)
  const paragraphs = message.split(/\n{2,}/).map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('')
  const link = statusUrl ? `<p><a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>` : ''
  return {
    subject,
    body: `<p>${escapeHtml(greeting)}</p>${paragraphs}${link}`,
    text: `${greeting}\n\n${message}${statusUrl ? `\n\n${statusUrl}` : ''}`,
    template: {
      name: `crew-status-${status}`,
      props: {
        name: variables.name,
        operationName: variables.operation,
        teamName: variables.team,
        role: variables.role,
        subject,
        message,
        statusUrl: statusUrl ?? null,
        greeting,
        heading: texts.headings[status],
        ...(texts.button[status] ? { button: texts.button[status] } : {}),
      },
      locale,
    },
    meta: { crewStatus: status },
  }
}

/**
 * Tells a person that their crew status changed (`crew-status-<status>` template, overridable per operation, and turned off
 * per status with `enabled: false`) through notify's `notifyUser` on the
 * `crew.status` topic, so they get it on the channels they chose. A failing send never fails the change itself: it is logged.
 */
export async function crewSendStatusEmail(event: H3Event, input: Omit<Parameters<typeof buildCrewStatusEmail>[0], 'statusUrl'> & { userId: number }): Promise<void> {
  try {
    const { userId, ...rest } = input
    const config = useRuntimeConfig(event).public.crew as { pages?: CrewPages, i18n?: LocaleRouting | null } | undefined
    // The status page, or the My crew tab of the crew home when the status lives there.
    const statusPath = crewStatusPath(config?.pages)
    // The page in the person's language: the locale prefix the site's routes use for it.
    const statusUrl = statusPath ? `${configuredAuthSiteOrigin(event) ?? getRequestURL(event).origin}${localizePath(statusPath, rest.locale, config?.i18n)}` : undefined
    const notification = buildCrewStatusEmail({ ...rest, statusUrl })
    if (notification) await crewSend(event, userId, notification)
  }
  catch (error) {
    console.error(`[crew] the "${input.status}" email could not be sent`, error)
  }
}
