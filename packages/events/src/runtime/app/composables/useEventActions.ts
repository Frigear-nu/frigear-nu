import type { DropdownMenuItem } from '@nuxt/ui'
import EventFormSlideover from '../components/EventFormSlideover.vue'
import type { StaffEventSummary } from '../utils/admin-event'

export type EventMenuOptions = {
  /** Items for the middle group, between the edits and the delete action. */
  extra?: DropdownMenuItem[]
  /** Runs after the event was deleted (refresh a list, leave the detail page). */
  onRemoved?: () => unknown
  /** Leave out "Open", e.g. on the event's own page. Defaults to `true`. */
  open?: boolean
  /** Leave out "View public page", e.g. when the page shows its own button. Defaults to `true`. */
  viewPublic?: boolean
}

/**
 * What staff can do with an event, shared by the list and the event page: `create` (a slideover that resolves with the
 * new event, or `false` when cancelled), `duplicate`, `remove` (confirms first) and `menu(event)`, the row menu in the
 * same order everywhere: Open, View public page, Duplicate | extras | Delete.
 */
export function useEventActions() {
  const t = useModuleT('events')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const links = useEventLinks()
  const tr = useEventsTranslate()
  const hasPublicPage = !!useRuntimeConfig().public.events?.pages?.event

  async function create(): Promise<{ id: string, slug: string } | false | undefined> {
    return overlay.create(EventFormSlideover, { destroyOnClose: true }).open()
  }

  async function duplicate(event: StaffEventSummary) {
    const copy = await run(
      () => $fetch<{ id: string }>(`/api/events/admin/events/${event.id}/clone`, { method: 'POST' }),
      { success: t('admin.duplicated', 'Event duplicated as a draft') },
    )
    if (copy) await navigateTo(links.adminEvent(copy.id))
    return copy
  }

  async function remove(event: StaffEventSummary): Promise<boolean> {
    const name = tr(event.name)
    const confirmed = await confirm({
      title: t('admin.deleteTitle', 'Delete {name}?', { name }),
      description: t('admin.deleteDescription', 'Its ticket types and add-ons are deleted too. Events with paid tickets cannot be deleted.'),
      confirmText: t('admin.deleteAction', 'Delete event'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(`/api/events/admin/events/${event.id}`, { method: 'DELETE' }),
      { success: t('admin.deleted', 'Deleted {name}', { name }), error: t('admin.deleteFailed', 'Could not delete the event') },
    )
    return done !== undefined
  }

  function menu(event: StaffEventSummary, options: EventMenuOptions = {}): DropdownMenuItem[][] {
    const main: DropdownMenuItem[] = []
    if (options.open !== false) {
      main.push({ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: links.adminEvent(event.id) })
    }
    if (options.viewPublic !== false && hasPublicPage && event.status === 'published') {
      main.push({ label: t('admin.viewPublic', 'View public page'), icon: 'i-lucide-external-link', to: links.event(event.slug), target: '_blank' })
    }
    const edits: DropdownMenuItem[] = [
      { label: t('admin.clone', 'Duplicate'), icon: 'i-lucide-copy', onSelect: () => { void duplicate(event) } },
      ...(options.extra ?? []),
    ]
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteAction', 'Delete event'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => {
        if (await remove(event)) await options.onRemoved?.()
      },
    }]
    return [main, edits, destructive].filter(group => group.length)
  }

  return { create, duplicate, remove, menu }
}
