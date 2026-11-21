import { conflict, idParams } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqItemDto } from '../../../../types'

// Publishes an item once it has text in every required language (`requiredLocales`, `da` and `en` by default) in both
// the question and the answer; otherwise `409 missing_translations`, with the missing languages in `data.missing`.
// Publishing a published item changes nothing and fires no hook.
export default defineEventHandler(async (event): Promise<AdminFaqItemDto> => {
  const principal = await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getFaqItemOr404(id)
  await authorize(event, faqAccess.permissions.manage, existing)
  if (existing.status === 'published') return toAdminFaqItemDto(existing)

  assertFaqPublishable(existing)
  const row = await setFaqItemStatus(existing, 'published', principal.user.id)
  if (!row) throw conflict('The item was changed by someone else. Reload it and try again.')
  const group = await callFaqGroupUpdated(event, row.groupId)
  const item = toAdminFaqItemDto(row)
  await useNitroApp().hooks.callHook('faq:item:published', { event, group, item })
  return item
})
