import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { buildConsent } from '../../../utils/consent'
import { getCookieConsentConfig } from '../../utils/consent'

const bodySchema = z.object({
  categories: z.record(z.string(), z.boolean()),
  version: z.string(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const config = getCookieConsentConfig(event)!
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.version !== config.version) {
    throw createError({ statusCode: 409, statusMessage: 'Outdated cookie consent version.' })
  }

  const known = new Set(config.categories.map(category => category.key))
  const unknown = Object.keys(body.categories).filter(key => !known.has(key))
  if (unknown.length) {
    throw createError({ statusCode: 400, statusMessage: `Unknown categories: ${unknown.join(', ')}` })
  }

  // The server is the source of truth for the timestamp and for required categories.
  const state = buildConsent(config.categories, config.version, body.categories)

  await db.update(schema.users)
    .set({
      cookieConsentAcceptedAt: state.ts,
      cookieConsentVersion: state.v,
      cookieConsentCategories: JSON.stringify(state.categories),
    })
    .where(eq(schema.users.id, user.id))

  await useNitroApp().hooks.callHook('cookie-consent:saved', { userId: user.id, state, acceptedAt: state.ts })

  return state
})
