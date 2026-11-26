import { idParams, notFound } from '@frigear-nu/module-kit/server'
import type { ShortLinkDto } from '../../../../types'
import { shortLinksAccess } from '../../../access'

// Disables any link, whoever owns it: the redirect answers 404 from now on.
export default defineEventHandler(async (event): Promise<ShortLinkDto> => {
  await authorize(event, shortLinksAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const link = await findShortLinkById(id)
  if (!link) throw notFound('Short link not found.')
  await authorize(event, shortLinksAccess.permissions.manage, link)
  const updated = await setShortLinkDisabled(id, true)
  if (!updated) throw notFound('Short link not found.')
  return toShortLinkDto(updated, event)
})
