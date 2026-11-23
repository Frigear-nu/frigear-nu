import { idParams } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { AdminTeamDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<AdminTeamDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.manage, row)
  return toAdminTeamDtoOf(event, row)
})
