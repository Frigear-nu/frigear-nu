import type { ChannelMatrixDto } from '../../../../types'

// The channel matrix of the caller: every registered topic with what applies to them (their choice, or the default).
export default defineEventHandler(async (event): Promise<ChannelMatrixDto> => {
  const { user } = await authorize(event, 'push:devices')
  return readPushChannelMatrix(user.id)
})
