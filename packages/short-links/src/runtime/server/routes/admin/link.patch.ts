import { apiError, idParams, notFound } from '@frigear-nu/module-kit/server'
import type { ShortLinkDto } from '../../../../types'
import { shortLinksAccess } from '../../../access'
import { SHORT_LINKS_MANUAL_OWNER } from '../../../utils/codes'
import { shortLinkPatchSchema } from '../../utils/short-links-schemas'

// Edits a link made by hand. Links another module owns are read-only here (`409 owned_link`): only disabling them is.
export default defineEventHandler(async (event): Promise<ShortLinkDto> => {
  await authorize(event, shortLinksAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, shortLinkPatchSchema.parse)
  const link = await findShortLinkById(id)
  if (!link) throw notFound('Short link not found.')
  await authorize(event, shortLinksAccess.permissions.manage, link)
  if (link.owner.module !== SHORT_LINKS_MANUAL_OWNER) {
    throw apiError(409, 'owned_link', `This link belongs to ${link.owner.module}; it can only be disabled here.`)
  }
  const updated = await updateShortLink(id, patch)
  if (!updated) throw notFound('Short link not found.')
  return toShortLinkDto(updated, event)
})
