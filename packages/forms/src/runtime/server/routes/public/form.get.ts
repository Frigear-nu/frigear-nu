import type { PublicFormDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<PublicFormDto> => {
  const form = await findPublishedForm(getRouterParam(event, 'slug')!)
  await authorizeFormAccess(event, form)
  return toPublicForm(form)
})
