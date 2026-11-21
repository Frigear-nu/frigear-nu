import type { PushDeviceDto } from '../../../../types'

// A user's push devices for staff, revoked ones included, newest first: needs `push:manage`, with the user as the
// target (action `view`, so no target protection), like the staff routes of `@frigear-nu/payments`.
export default defineEventHandler(async (event): Promise<PushDeviceDto[]> => {
  const { target } = await loadUsersAdminTarget(event, 'view', { permission: 'push:manage' })
  return listAllPushDevices(target.id)
})
