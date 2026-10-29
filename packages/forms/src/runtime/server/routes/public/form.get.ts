import type { PublicFormDto } from '../../../../types'
import { slugParams } from '../../utils/admin-schemas'

export default defineEventHandler(async (event): Promise<PublicFormDto> => {
  const { slug } = await getValidatedRouterParams(event, slugParams.parse)
  const form = await findPublishedForm(slug)
  await authorizeFormAccess(event, form)
  return toPublicForm(form)
})
