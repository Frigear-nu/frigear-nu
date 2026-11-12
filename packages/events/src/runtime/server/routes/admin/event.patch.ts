import { idParams } from '@frigear-nu/module-kit/server'
import type { AdminEventDto } from '../../../../types'
import { eventPatchSchema, patchEventRow } from '../../utils/admin'

export default defineEventHandler(async (event): Promise<AdminEventDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, eventPatchSchema.parse)
  return toAdminEventDto(await patchEventRow(id, patch))
})
