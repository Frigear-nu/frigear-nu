import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'

// Deletes a group and all its items. `faq:group:updated` fires with the group as it was.
export default defineEventHandler(async (event) => {
  await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getFaqGroupOr404(id)
  await authorize(event, faqAccess.permissions.manage, existing)
  const last = await faqGroupHookDto(existing)
  await deleteFaqGroupRow(id)
  await useNitroApp().hooks.callHook('faq:group:updated', { event, group: last })
  return noContent(event)
})
