import { z } from 'zod'
import type { CampaignFormFields } from '../../types'
import { normalizeCampaignEmail, normalizeCampaignPhone } from './schemas'

// A forms submission as a signup (`forms:submitted`): which answers of a mapped form hold the address, the name and the
// consent. Plain functions, so they are tested without a server.

/** What a submission signs up with. */
export type CampaignFormSignup = { email?: string, phone?: string, name?: string }

/** A ticked consent field: `true`, a checked checkbox's text value, or a checkbox group with a choice. */
function campaignFormChecked(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'string') return ['on', 'true', '1', 'yes'].includes(value.trim().toLowerCase())
  return Array.isArray(value) && value.length > 0
}

const emailShape = z.email().max(254)

/**
 * The signup of a submission of a mapped form, or `null` when it signs nobody up: the list maps no consent field, the
 * consent was not ticked, or there is neither a valid email address nor a full international phone number.
 */
export function campaignFormSignup(fields: CampaignFormFields | null | undefined, answers: Record<string, unknown>): CampaignFormSignup | null {
  if (!fields?.consent || !campaignFormChecked(answers[fields.consent])) return null
  const text = (key: string | undefined) => {
    const value = key ? answers[key] : undefined
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
  const rawEmail = text(fields.email)
  const email = rawEmail && emailShape.safeParse(normalizeCampaignEmail(rawEmail)).success ? normalizeCampaignEmail(rawEmail) : undefined
  const rawPhone = text(fields.phone)
  const phone = rawPhone ? normalizeCampaignPhone(rawPhone) ?? undefined : undefined
  if (!email && !phone) return null
  const name = text(fields.name)?.slice(0, 120)
  return { ...(email && { email }), ...(phone && { phone }), ...(name && { name }) }
}
