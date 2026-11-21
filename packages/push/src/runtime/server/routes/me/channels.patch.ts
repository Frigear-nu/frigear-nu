import { z } from 'zod'
import { validationError } from '@frigear-nu/module-kit/server'
import type { ChannelMatrixDto } from '../../../../types'

const channelsSchema = z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).partial().strict()
const bodySchema = z.object({ topics: z.record(z.string().min(1).max(100), channelsSchema) })

// Changes the caller's channels for some topics; topics left out stay as they are. A topic nobody registered is refused
// (400 `validation_failed`, naming it) rather than stored. Answers the whole matrix.
export default defineEventHandler(async (event): Promise<ChannelMatrixDto> => {
  const { user } = await authorize(event, 'push:devices')
  const { topics } = await readValidatedBody(event, bodySchema.parse)

  const unknown = Object.keys(topics).filter(id => !findPushTopic(id))
  if (unknown.length) {
    throw validationError(unknown.map(id => ({ code: 'custom', path: ['topics', id], message: `Unknown notification topic "${id}".` })))
  }
  await savePushChannelChoices(user.id, topics)
  return readPushChannelMatrix(user.id)
})
