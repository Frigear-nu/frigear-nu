import { idParams, noContent } from '@frigear-nu/module-kit/server'

// Deletes the application with its authorization codes and refresh tokens.
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  await deleteApplication(id)
  return noContent(event)
})
