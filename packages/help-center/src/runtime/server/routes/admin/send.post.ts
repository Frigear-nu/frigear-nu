import { helpCenterAccess } from '../../../access'
import type { HelpSendResult } from '../../../../types'

// Sends links to articles to an audience by email and SMS (`channels`). `audience` is `userIds` (explicit people) and/or
// `operationId`, `teamId`, `globalRoles`, which `help-center:audience:resolve` listeners (teams, crew) turn into people.
// Each person gets only the articles they may read. Push comes with `@frigear-nu/push`.
export default defineEventHandler(async (event): Promise<HelpSendResult> => {
  await authorize(event, helpCenterAccess.permissions.send)
  const input = await readValidatedBody(event, helpSendInput.parse)
  return sendHelpArticles(event, input)
})
