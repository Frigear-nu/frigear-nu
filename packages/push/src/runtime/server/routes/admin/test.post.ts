import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import type { SendPushResult } from '../../../../types'

const bodySchema = z.object({ userId: z.number().int().positive() })

// Sends a test push to every active device of a user, so staff can check a phone is reachable. Answers what
// `sendPush` did (`{ sent, failed, revoked }`); with the `log` driver the push only appears in the server log.
export default defineEventHandler(async (event): Promise<SendPushResult> => {
  await authorize(event, 'push:send')
  const { userId } = await readValidatedBody(event, bodySchema.parse)
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!target) throw notFound('User not found.')
  await authorize(event, 'push:send', target)
  // Each device gets the text for the locale it registered with.
  return sendPush(event, {
    userIds: [userId],
    title: { da: 'Testnotifikation', en: 'Test notification' },
    body: { da: 'Kan du læse dette, virker pushnotifikationer på denne enhed.', en: 'If you can read this, push notifications reach this device.' },
  })
})
