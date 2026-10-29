import type { FormAccessInfoDto } from '../../../../types'
import { slugParams } from '../../utils/admin-schemas'

// What the public page needs to decide between the form, a gate and "not found"; no secrets, no definition.
export default defineEventHandler(async (event): Promise<FormAccessInfoDto> => {
  const { slug } = await getValidatedRouterParams(event, slugParams.parse)
  return describeFormAccess(event, await findPublishedForm(slug))
})
