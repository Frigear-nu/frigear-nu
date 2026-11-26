import { idParams, notFound } from '@frigear-nu/module-kit/server'
import type { ShortLinkDto } from '../../../../types'
import { shortLinksAccess } from '../../../access'

// Enables a disabled link again, whoever owns it.
export default defineEventHandler(async (event): Promise<ShortLinkDto> => {
  await authorize(event, shortLinksAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const link = await findShortLinkById(id)
  if (!link) throw notFound('Short link not found.')
  await authorize(event, shortLinksAccess.permissions.manage, link)
  const updated = await setShortLinkDisabled(id, false)
  if (!updated) throw notFound('Short link not found.')
  return toShortLinkDto(updated, event)
})
