import type { H3Event } from 'h3'
import type { EmailNotification } from '@frigear-nu/notify/types'
import type { CrewMemberDto, CrewStatus, Translated } from '../../../types'
import { CREW_STATUS_LABELS, translate } from '../../utils'
import type { CrewSettingsRow } from './crew-settings'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const DEFAULT_SUBJECTS: Record<CrewStatus, string> = {
  applied: 'We received your application for {{operation}}',
  waitlisted: 'You are on the waiting list for {{operation}}',
  approved: 'You are on the crew of {{operation}}',
  rejected: 'Your application for {{operation}}',
  withdrawn: 'You withdrew from {{operation}}',
}

const DEFAULT_MESSAGES: Record<CrewStatus, string> = {
  applied: 'Thank you for applying. We will get back to you once the crew has been decided.',
  waitlisted: 'The crew is full for now, so you are on the waiting list. We will let you know if a place opens up.',
  approved: 'Welcome to the crew! You are on the team {{team}}.',
  rejected: 'Thank you for applying. Unfortunately we cannot offer you a place on the crew this time.',
  withdrawn: 'You are no longer part of the crew. You can apply again while applications are open.',
}

/** `{{name}}` style variables of a status email: the person, the operation, their team and role, and the status. */
export type CrewEmailVariables = { name: string, operation: string, team: string, role: string, status: string }

const fill = (text: string, variables: CrewEmailVariables) =>
  text.replace(/\{\{\s*(name|operation|team|role|status)\s*\}\}/g, (_match, key: keyof CrewEmailVariables) => variables[key])

/** The email of a status change, from the operation's own texts or the built-in ones. `null` when it is turned off. */
export function buildCrewStatusEmail(input: {
  status: CrewStatus
  member: Pick<CrewMemberDto, 'email' | 'name' | 'teamName' | 'role'>
  operationName: Translated
  roleLabel: string
  settings: Pick<CrewSettingsRow, 'statusEmails'> | undefined
  statusUrl?: string
  locale?: string
}): EmailNotification | null {
  const { status, member, settings, statusUrl } = input
  const config = settings?.statusEmails?.[status]
  if (config?.enabled === false || !member.email) return null
  const locale = input.locale ?? 'en'
  const variables: CrewEmailVariables = {
    name: member.name ?? '',
    operation: translate(input.operationName, locale, 'en'),
    team: translate(member.teamName, locale, 'en'),
    role: input.roleLabel,
    status: CREW_STATUS_LABELS[status],
  }
  const customSubject = translate(config?.subject, locale, 'en')
  const customBody = translate(config?.body, locale, 'en')
  const subject = fill(customSubject || DEFAULT_SUBJECTS[status], variables)
  const message = fill(customBody || DEFAULT_MESSAGES[status], variables)
  const paragraphs = message.split(/\n{2,}/).map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('')
  const link = statusUrl ? `<p><a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>` : ''
  return {
    to: member.email,
    subject,
    body: `<p>Hi ${escapeHtml(variables.name)},</p>${paragraphs}${link}`,
    text: `Hi ${variables.name},\n\n${message}${statusUrl ? `\n\n${statusUrl}` : ''}`,
    template: {
      name: `crew-status-${status}`,
      props: { name: variables.name, operationName: variables.operation, teamName: variables.team, role: variables.role, subject, message, statusUrl: statusUrl ?? null },
      locale,
    },
    meta: { crewStatus: status },
  }
}

/**
 * Emails a person that their crew status changed (`crew-status-<status>` template, overridable per operation). A failing
 * email never fails the change itself: it is logged.
 */
export async function crewSendStatusEmail(event: H3Event, input: Omit<Parameters<typeof buildCrewStatusEmail>[0], 'statusUrl'>): Promise<void> {
  try {
    const statusPath = (useRuntimeConfig(event).public.crew as { pages?: { status?: string } } | undefined)?.pages?.status
    const notification = buildCrewStatusEmail({ ...input, statusUrl: statusPath ? `${getRequestURL(event).origin}${statusPath}` : undefined })
    if (notification) await dispatchEmailNotification(notification)
  }
  catch (error) {
    console.error(`[crew] the "${input.status}" email could not be sent`, error)
  }
}
