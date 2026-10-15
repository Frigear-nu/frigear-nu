import { pgTable, bigint, text } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  // When the user last responded to the cookie banner (epoch ms) - proof of consent for GDPR.
  cookieConsentAcceptedAt: bigint('cookie_consent_accepted_at', { mode: 'number' }),
  // The consent version (manual version + category-set hash) the choice was made against.
  cookieConsentVersion: text('cookie_consent_version'),
  // JSON of exactly what was granted, e.g. {"necessary":true,"analytics":false}.
  cookieConsentCategories: text('cookie_consent_categories'),
})
