import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { apiError } from '@frigear-nu/module-kit/server'
import type { ConsentDto } from '../../../../types'
import { buildConsent } from '../../../utils/consent'
import { getCookieConsentConfig } from '../../utils/consent'

const bodySchema = z.object({
  categories: z.record(z.string(), z.boolean()),
  version: z.string(),
})

// `POST /api/cookie-consent` (session only): stores the user's choice and answers it, like `GET`.
export default defineEventHandler(async (event): Promise<ConsentDto> => {
  const user = await requireUser(event, { sessionOnly: true })
  const config = getCookieConsentConfig(event)!
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.version !== config.version) {
    throw apiError(409, 'outdated_version', 'Outdated cookie consent version.')
  }

  const known = new Set(config.categories.map(category => category.key))
  const unknown = Object.keys(body.categories).filter(key => !known.has(key))
  if (unknown.length) {
    throw apiError(400, 'unknown_categories', `Unknown categories: ${unknown.join(', ')}`, { categories: unknown })
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

  return { consent: state }
})
