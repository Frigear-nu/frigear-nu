import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  // When the user last responded to the cookie banner (epoch ms) - proof of consent for GDPR.
  cookieConsentAcceptedAt: integer('cookie_consent_accepted_at'),
  // The consent version (manual version + category-set hash) the choice was made against.
  cookieConsentVersion: text('cookie_consent_version'),
  // JSON of exactly what was granted, e.g. {"necessary":true,"analytics":false}.
  cookieConsentCategories: text('cookie_consent_categories'),
})
