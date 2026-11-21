import type { PushDeviceDto } from '../../../../types'

// The caller's active devices, newest first.
export default defineEventHandler(async (event): Promise<PushDeviceDto[]> => {
  const { user } = await authorize(event, 'push:devices')
  return listPushDevices(user.id)
})
