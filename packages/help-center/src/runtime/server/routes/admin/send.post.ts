import { helpCenterAccess } from '../../../access'
import type { HelpSendResult } from '../../../../types'

// Sends links to articles to an audience by email and SMS (`channels`). `audience` is `userIds` (explicit people) and/or
// `grants` (a grant list of `@frigear-nu/auth`), whose kinds list their members. Each person gets only the articles
// their own grants let them read. The email and a push go through notify's `notifyUser`, by each person's choices.
export default defineEventHandler(async (event): Promise<HelpSendResult> => {
  await authorize(event, helpCenterAccess.permissions.send)
  const input = await readValidatedBody(event, helpSendInput.parse)
  return sendHelpArticles(event, input)
})
