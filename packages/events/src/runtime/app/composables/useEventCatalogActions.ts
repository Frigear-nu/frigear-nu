import type { DropdownMenuItem } from '@nuxt/ui'
import { type MaybeRefOrGetter, toValue } from 'vue'
import EventAddonGroupSlideover from '../components/EventAddonGroupSlideover.vue'
import EventAddonSlideover from '../components/EventAddonSlideover.vue'
import EventTicketTypeSlideover from '../components/EventTicketTypeSlideover.vue'
import type { MembershipPlans, StaffAddon, StaffAddonGroup, StaffTicketType } from '../utils/admin-event'
import { eventsApi } from '../../utils/api'
import { $fetch, useAction, useConfirmDialog, useEventsTranslate, useModuleT, useOverlay } from '#imports'

export type EventCatalogActionsOptions = {
  /** The event new ticket types are added to. Only needed to add ticket types. */
  eventId?: MaybeRefOrGetter<string | undefined>
  /** Runs after a ticket type, add-on group or choice was saved or deleted, e.g. to refresh the event. */
  onChanged?: () => unknown
  /** The memberships the ticket type form offers (`@frigear-nu/subscriptions`), read when the form opens. */
  membership?: () => MembershipPlans | undefined
}

/** What a catalog form resolves with: the saved record, or `false` when cancelled or failed. */
export type CatalogSaved = { id: string } | false

/**
 * What staff can do with an event's catalog: its ticket types, their add-on groups and the choices in them.
 * `openTicketType` / `openGroup` / `openAddon` open the create (no record) or edit form in a slideover and resolve
 * with the saved record or `false`; `removeTicketType` / `removeGroup` / `removeAddon` confirm first and resolve
 * `true` once deleted; `typeMenu` / `groupMenu` / `addonMenu` are the `RowMenu` items (edits, then the delete in its
 * own red group). Every save and delete runs `onChanged` afterwards.
 */
export function useEventCatalogActions(options: EventCatalogActionsOptions = {}) {
  const t = useModuleT('events')
  const tr = useEventsTranslate()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()

  async function changed<T>(result: T): Promise<T> {
    if (result) await options.onChanged?.()
    return result
  }

  /** Adds a ticket type to the event (`eventId` option), or edits `ticketType`. */
  async function openTicketType(ticketType?: StaffTicketType): Promise<CatalogSaved> {
    const eventId = toValue(options.eventId) ?? ''
    if (!ticketType && !eventId) throw new Error('useEventCatalogActions: pass `eventId` to add ticket types.')
    const saved = await overlay.create(EventTicketTypeSlideover, { destroyOnClose: true })
      .open({ eventId, ticketType, membership: options.membership?.() })
    return changed(saved || false)
  }

  /** Adds an add-on group to `ticketType`, or edits `group`. */
  async function openGroup(ticketType: StaffTicketType, group?: StaffAddonGroup): Promise<CatalogSaved> {
    const saved = await overlay.create(EventAddonGroupSlideover, { destroyOnClose: true })
      .open({ ticketTypeId: ticketType.id, group })
    return changed(saved || false)
  }

  /** Adds a choice to `group` (priced in `ticketType`'s currency), or edits `addon`. */
  async function openAddon(ticketType: StaffTicketType, group: StaffAddonGroup, addon?: StaffAddon): Promise<CatalogSaved> {
    const saved = await overlay.create(EventAddonSlideover, { destroyOnClose: true })
      .open({ groupId: group.id, currency: ticketType.currency, addon })
    return changed(saved || false)
  }

  async function remove(request: { url: string, title: string, description: string, confirmText: string, success: string }) {
    const confirmed = await confirm({ title: request.title, description: request.description, confirmText: request.confirmText, destructive: true })
    if (!confirmed) return false
    const done = await run(() => $fetch(request.url, { method: 'DELETE' }).then(() => true), { success: request.success })
    return changed(done === true)
  }

  function removeTicketType(ticketType: StaffTicketType): Promise<boolean> {
    const name = tr(ticketType.name)
    return remove({
      url: eventsApi.admin.ticketType(ticketType.id),
      title: t('admin.confirmRemoveType', 'Delete {name}?', { name }),
      description: t('admin.confirmRemoveTypeDescription', 'Its add-on groups and choices are deleted too. A ticket type with active tickets cannot be deleted.'),
      confirmText: t('admin.removeType', 'Delete ticket type'),
      success: t('admin.typeDeleted', 'Deleted {name}', { name }),
    })
  }

  function removeGroup(group: StaffAddonGroup): Promise<boolean> {
    const name = tr(group.title)
    return remove({
      url: eventsApi.admin.addonGroup(group.id),
      title: t('admin.confirmRemoveGroup', 'Delete {name}?', { name }),
      description: t('admin.confirmRemoveGroupDescription', 'Its choices are deleted too. Tickets already bought keep the choices they made.'),
      confirmText: t('admin.removeGroup', 'Delete add-on group'),
      success: t('admin.groupDeleted', 'Deleted {name}', { name }),
    })
  }

  function removeAddon(addon: StaffAddon): Promise<boolean> {
    const name = tr(addon.label)
    return remove({
      url: eventsApi.admin.addon(addon.id),
      title: t('admin.confirmRemoveAddon', 'Delete {name}?', { name }),
      description: t('admin.confirmRemoveAddonDescription', 'Tickets already bought keep the choice they made.'),
      confirmText: t('admin.removeAddon', 'Delete choice'),
      success: t('admin.addonDeleted', 'Deleted {name}', { name }),
    })
  }

  /** Edit ticket type, Add add-on group | Delete ticket type. */
  function typeMenu(ticketType: StaffTicketType): DropdownMenuItem[][] {
    return [
      [
        { label: t('admin.editType', 'Edit ticket type'), icon: 'i-lucide-pencil', onSelect: () => { void openTicketType(ticketType) } },
        { label: t('admin.addGroup', 'Add add-on group'), icon: 'i-lucide-plus', onSelect: () => { void openGroup(ticketType) } },
      ],
      [{ label: t('admin.removeType', 'Delete ticket type'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void removeTicketType(ticketType) } }],
    ]
  }

  /** Edit add-on group, Add choice | Delete add-on group. */
  function groupMenu(ticketType: StaffTicketType, group: StaffAddonGroup): DropdownMenuItem[][] {
    return [
      [
        { label: t('admin.editGroup', 'Edit add-on group'), icon: 'i-lucide-pencil', onSelect: () => { void openGroup(ticketType, group) } },
        { label: t('admin.addAddon', 'Add choice'), icon: 'i-lucide-plus', onSelect: () => { void openAddon(ticketType, group) } },
      ],
      [{ label: t('admin.removeGroup', 'Delete add-on group'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void removeGroup(group) } }],
    ]
  }

  /** Edit choice | Delete choice. */
  function addonMenu(ticketType: StaffTicketType, group: StaffAddonGroup, addon: StaffAddon): DropdownMenuItem[][] {
    return [
      [{ label: t('admin.editAddon', 'Edit choice'), icon: 'i-lucide-pencil', onSelect: () => { void openAddon(ticketType, group, addon) } }],
      [{ label: t('admin.removeAddon', 'Delete choice'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void removeAddon(addon) } }],
    ]
  }

  return { openTicketType, openGroup, openAddon, removeTicketType, removeGroup, removeAddon, typeMenu, groupMenu, addonMenu }
}
