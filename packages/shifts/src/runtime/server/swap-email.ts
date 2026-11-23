import type { EmailNotification } from '@frigear-nu/notify/types'

// The swap emails, built without Nitro (tested as a unit). `shiftsSendSwapEmail` (server utils) fills and sends them.

/**
 * The swap emails: a new offer (to the owner), accepted / rejected (to the offerer, and the owner on an approver's
 * rejection), completed (both), pending approval (to the leads), and proposed (a trade aimed at one shift, to its holder).
 */
export type ShiftSwapEmailKind = 'offered' | 'accepted' | 'rejected' | 'completed' | 'pending' | 'proposed'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SUBJECTS: Record<ShiftSwapEmailKind, string> = {
  offered: 'New offer for your shift on {{when}}',
  accepted: 'Your offer for the shift on {{when}} was accepted',
  rejected: 'The swap of the shift on {{when}} did not go through',
  completed: 'Shift swap done: {{when}}',
  pending: 'A shift swap waits for your approval: {{when}}',
  proposed: '{{owner}} wants to trade shifts with you: {{backWhen}}',
}

/** A release: one shift changes hands. */
const RELEASE: Record<ShiftSwapEmailKind, string> = {
  offered: '{{offerer}} offers to take your shift on {{team}} on {{when}} over. Accept or reject the offer on the shift\'s page.',
  accepted: '{{owner}} accepted your offer for the shift on {{team}} on {{when}}. When the swap is done you get another email.',
  rejected: 'The swap of the shift on {{team}} on {{when}} did not go through. The shift stays as it was.',
  completed: 'The swap of the shift on {{team}} on {{when}} is done: {{offerer}} took it over. Check your shifts for your new plan.',
  pending: '{{offerer}} wants to take over {{owner}}\'s shift on {{team}} on {{when}}. As a lead of the team, approve or reject the swap.',
  proposed: '{{owner}} wants your shift on {{backTeam}} on {{backWhen}} for theirs on {{team}} on {{when}}. Offer your shift on the open swaps page to trade.',
}

/** A trade: both shifts change hands together, so both are named. */
const TRADE: Record<ShiftSwapEmailKind, string> = {
  offered: '{{offerer}} offers their shift on {{backTeam}} on {{backWhen}} for your shift on {{team}} on {{when}}. Accept or reject the trade on the shift\'s page.',
  accepted: '{{owner}} accepted your trade: your shift on {{backTeam}} on {{backWhen}} for theirs on {{team}} on {{when}}. When the trade is done you get another email.',
  rejected: 'The trade of the shift on {{team}} on {{when}} for the one on {{backTeam}} on {{backWhen}} did not go through. Both shifts stay as they were.',
  completed: 'The trade is done: {{offerer}} works {{owner}}\'s shift on {{team}} on {{when}}, and {{owner}} works {{offerer}}\'s shift on {{backTeam}} on {{backWhen}}. Check your shifts for your new plan.',
  pending: '{{owner}} and {{offerer}} want to trade shifts: {{owner}}\'s shift on {{team}} on {{when}} for {{offerer}}\'s on {{backTeam}} on {{backWhen}}. As a lead of the team, approve or reject the trade.',
  proposed: '{{owner}} wants your shift on {{backTeam}} on {{backWhen}} for theirs on {{team}} on {{when}}. Offer your shift on the open swaps page to trade.',
}

/**
 * `{{name}}` style variables of a swap email. `team` and `when` are the owner's shift; `backTeam` and `backWhen` the shift
 * given in return (a trade), empty for a release.
 */
export type ShiftSwapEmailVariables = { name: string, owner: string, offerer: string, team: string, when: string, backTeam: string, backWhen: string }

const fill = (text: string, variables: ShiftSwapEmailVariables) =>
  text.replace(/\{\{\s*(name|owner|offerer|team|when|backTeam|backWhen)\s*\}\}/g, (_match, key: keyof ShiftSwapEmailVariables) => variables[key])

/** The email of a swap event to one person. `trade` names both shifts. `null` without an address. */
export function buildShiftSwapEmail(input: {
  kind: ShiftSwapEmailKind
  email: string | null
  variables: ShiftSwapEmailVariables
  trade?: boolean
  url?: string
  locale?: string
}): EmailNotification | null {
  const { kind, email, variables, url } = input
  if (!email) return null
  const subject = fill(SUBJECTS[kind], variables)
  const message = fill((input.trade ? TRADE : RELEASE)[kind], variables)
  const link = url ? `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ''
  return {
    to: email,
    subject,
    body: `<p>Hi ${escapeHtml(variables.name)},</p><p>${escapeHtml(message)}</p>${link}`,
    text: `Hi ${variables.name},\n\n${message}${url ? `\n\n${url}` : ''}`,
    template: {
      name: `shifts-swap-${kind}`,
      props: { name: variables.name, subject, message, url: url ?? null, trade: !!input.trade },
      locale: input.locale ?? 'en',
    },
    meta: { shiftSwap: kind },
  }
}
