import type { FormAccessInfoDto } from '../../../../types'

// What the public page needs to decide between the form, a gate and "not found"; no secrets, no definition.
export default defineEventHandler(async (event): Promise<FormAccessInfoDto> => {
  return describeFormAccess(event, await findPublishedForm(getRouterParam(event, 'slug')!))
})
