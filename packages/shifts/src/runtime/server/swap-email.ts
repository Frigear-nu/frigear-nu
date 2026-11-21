import type { EmailNotification } from '@frigear-nu/notify/types'

// The swap emails, built without Nitro (tested as a unit). `shiftsSendSwapEmail` (server utils) fills and sends them.

/** The swap emails: a new offer (to the owner), accepted / rejected (to the offerer, and the owner on an approver's rejection), completed (both), pending approval (to the leads). */
export type ShiftSwapEmailKind = 'offered' | 'accepted' | 'rejected' | 'completed' | 'pending'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SUBJECTS: Record<ShiftSwapEmailKind, string> = {
  offered: 'New offer for your shift on {{when}}',
  accepted: 'Your offer for the shift on {{when}} was accepted',
  rejected: 'The swap of the shift on {{when}} did not go through',
  completed: 'Shift swap done: {{when}}',
  pending: 'A shift swap waits for your approval: {{when}}',
}

const MESSAGES: Record<ShiftSwapEmailKind, string> = {
  offered: '{{offerer}} offers to take your shift on {{team}} on {{when}}. Accept or reject the offer on the shift\'s page.',
  accepted: '{{owner}} accepted your offer for the shift on {{team}} on {{when}}. When the swap is done you get another email.',
  rejected: 'The swap of the shift on {{team}} on {{when}} did not go through. The shift stays as it was.',
  completed: 'The swap of the shift on {{team}} on {{when}} is done. Check your shifts for your new plan.',
  pending: '{{offerer}} wants to take over {{owner}}\'s shift on {{team}} on {{when}}. As a lead of the team, approve or reject the swap.',
}

/** `{{name}}` style variables of a swap email. */
export type ShiftSwapEmailVariables = { name: string, owner: string, offerer: string, team: string, when: string }

const fill = (text: string, variables: ShiftSwapEmailVariables) =>
  text.replace(/\{\{\s*(name|owner|offerer|team|when)\s*\}\}/g, (_match, key: keyof ShiftSwapEmailVariables) => variables[key])

/** The email of a swap event to one person. `null` without an address. */
export function buildShiftSwapEmail(input: {
  kind: ShiftSwapEmailKind
  email: string | null
  variables: ShiftSwapEmailVariables
  url?: string
  locale?: string
}): EmailNotification | null {
  const { kind, email, variables, url } = input
  if (!email) return null
  const subject = fill(SUBJECTS[kind], variables)
  const message = fill(MESSAGES[kind], variables)
  const link = url ? `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ''
  return {
    to: email,
    subject,
    body: `<p>Hi ${escapeHtml(variables.name)},</p><p>${escapeHtml(message)}</p>${link}`,
    text: `Hi ${variables.name},\n\n${message}${url ? `\n\n${url}` : ''}`,
    template: {
      name: `shifts-swap-${kind}`,
      props: { name: variables.name, subject, message, url: url ?? null },
      locale: input.locale ?? 'en',
    },
    meta: { shiftSwap: kind },
  }
}
