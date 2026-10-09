import type { PublicFormDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<PublicFormDto> => {
  return toPublicForm(await findPublishedForm(getRouterParam(event, 'slug')!))
})
