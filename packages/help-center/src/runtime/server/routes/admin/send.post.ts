import { helpCenterAccess } from '../../../access'
import type { HelpSendResult } from '../../../../types'

// Sends links to articles to an audience by email and SMS (`channels`). `audience` is `userIds` (explicit people) and/or
// `grants` (a grant list of `@frigear-nu/grants`), whose kinds list their members. Each person gets only the articles
// their own grants let them read. Push comes with `@frigear-nu/push`.
export default defineEventHandler(async (event): Promise<HelpSendResult> => {
  await authorize(event, helpCenterAccess.permissions.send)
  const input = await readValidatedBody(event, helpSendInput.parse)
  return sendHelpArticles(event, input)
})
