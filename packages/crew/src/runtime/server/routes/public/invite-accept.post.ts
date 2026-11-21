import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { MyCrewDto } from '../../../../types'

// Accepts an invite link for the signed-in caller: they join the invite's team approved, with the invite's role. A use is
// claimed atomically. 404 for an unknown token, 410 (`invite_revoked`, `invite_expired`, `invite_used`) for a link that
// cannot be used any more, 409 `crew_already_member` when the caller is on the team already.
export default defineEventHandler(async (event): Promise<MyCrewDto> => {
  const principal = await authorize(event, crewAccess.permissions.apply)
  const { token } = await getValidatedRouterParams(event, idParams('token').parse)
  return crewAcceptInvite(event, token, Number(principal.user.id))
})
