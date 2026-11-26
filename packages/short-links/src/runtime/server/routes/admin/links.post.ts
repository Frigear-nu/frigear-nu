import { created } from '@frigear-nu/module-kit/server'
import type { ShortLinkDto } from '../../../../types'
import { shortLinksAccess } from '../../../access'
import { SHORT_LINKS_MANUAL_OWNER } from '../../../utils/codes'
import { shortLinkCreateSchema } from '../../utils/short-links-schemas'

// Makes a short link by hand (owner `short-links`).
export default defineEventHandler(async (event): Promise<ShortLinkDto> => {
  const principal = await authorize(event, shortLinksAccess.permissions.manage)
  const body = await readValidatedBody(event, shortLinkCreateSchema.parse)
  const link = await createShortLink({
    ...body,
    owner: { module: SHORT_LINKS_MANUAL_OWNER },
    createdBy: principal.user ? Number(principal.user.id) : null,
  })
  return created(event, toShortLinkDto(link, event))
})
