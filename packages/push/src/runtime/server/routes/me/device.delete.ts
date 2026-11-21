import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

// Removes one of the caller's devices. Another user's device answers 404, like an unknown id.
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'push:devices')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const device = await findOwnPushDevice(user.id, id)
  if (!device) throw notFound('Device not found.')
  await authorize(event, 'push:devices', device)
  await removePushDevice(user.id, id)
  return noContent(event)
})
