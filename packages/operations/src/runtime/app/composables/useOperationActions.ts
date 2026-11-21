import type { DropdownMenuItem } from '@nuxt/ui'
import OperationFormSlideover from '../components/OperationFormSlideover.vue'
import type { StaffOperation, StaffOperationSummary } from '../utils/admin-operation'
import { operationsApi } from '../../utils/api'
import { nextStatuses } from '../../utils/status'
import type { OperationStatus } from '../../../types'
import { $fetch, navigateTo, useAction, useConfirmDialog, useModuleT, useOperationLinks, useOperationsTranslate, useOverlay, useRuntimeConfig } from '#imports'

export type OperationMenuOptions = {
  /** Items for the middle group, between the edits and the delete action. */
  extra?: DropdownMenuItem[]
  /** Runs after the operation was deleted (refresh a list, leave the detail page). */
  onRemoved?: () => unknown
  /** Runs after the operation was edited or its status changed (refresh a list or the detail page). */
  onChanged?: () => unknown
  /** Leave out "Open", e.g. on the operation's own page. Defaults to `true`. */
  open?: boolean
  /** Leave out "View public page", e.g. when the page shows its own button. Defaults to `true`. */
  viewPublic?: boolean
}

/**
 * What staff can do with an operation, shared by the list and the operation page: `create` (a slideover; navigates to
 * the new operation and resolves with it, or `false` when cancelled), `edit` (the same slideover), `changeStatus`
 * (confirms before archiving), `remove` (confirms first) and `menu(operation)`, the row menu in the same order
 * everywhere: Open, View public page | Edit, Change status | extras | Delete.
 */
export function useOperationActions() {
  const t = useModuleT('operations')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const links = useOperationLinks()
  const tr = useOperationsTranslate()
  const hasPublicPage = !!useRuntimeConfig().public.operations?.pages?.public

  /** Opens the create form and, once saved, goes to the new operation's admin page. Resolves with it, or `false`. */
  async function create(): Promise<StaffOperation | false> {
    const created = await overlay.create(OperationFormSlideover, { destroyOnClose: true, props: { operation: undefined } }).open() as StaffOperation | false
    if (!created) return false
    await navigateTo(links.adminOperation(created.id))
    return created
  }

  /** Opens the edit form. Resolves with the saved operation, or `false` when cancelled. */
  async function edit(operation: StaffOperation): Promise<StaffOperation | false> {
    return await overlay.create(OperationFormSlideover, { destroyOnClose: true, props: { operation } }).open() as StaffOperation | false
  }

  /** Moves the operation to `to`. Archiving asks first: it is final. Resolves with the updated operation, or `false`. */
  async function changeStatus(operation: StaffOperationSummary, to: OperationStatus): Promise<StaffOperation | false> {
    const name = tr(operation.name)
    if (to === 'archived') {
      const confirmed = await confirm({
        title: t('admin.archiveTitle', 'Archive {name}?', { name }),
        description: t('admin.archiveDescription', 'An archived operation is final: it cannot be started or reopened.'),
        confirmText: t('admin.archiveAction', 'Archive operation'),
        destructive: true,
      })
      if (!confirmed) return false
    }
    const updated = await run(
      () => $fetch<StaffOperation>(operationsApi.admin.status(operation.id), { method: 'POST', body: { status: to } }),
      {
        success: t('admin.statusChanged', '{name} is now {status}', { name, status: t(`admin.statuses.${to}`, to) }),
        error: t('admin.statusFailed', 'Could not change the status'),
      },
    )
    return updated ?? false
  }

  async function remove(operation: StaffOperationSummary): Promise<boolean> {
    const name = tr(operation.name)
    const confirmed = await confirm({
      title: t('admin.deleteTitle', 'Delete {name}?', { name }),
      description: t('admin.deleteDescription', 'Crew, shifts and maps attached to it stay behind without an operation. Archive an operation that has been worked instead.'),
      confirmText: t('admin.deleteAction', 'Delete operation'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      // 204: resolves with no body, so map success to `true` (`run` resolves `undefined` on failure).
      () => $fetch(operationsApi.admin.operation(operation.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.deleted', 'Deleted {name}', { name }), error: t('admin.deleteFailed', 'Could not delete the operation') },
    )
    return done === true
  }

  function menu(operation: StaffOperationSummary, options: OperationMenuOptions = {}): DropdownMenuItem[][] {
    const main: DropdownMenuItem[] = []
    if (options.open !== false) {
      main.push({ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: links.adminOperation(operation.id) })
    }
    if (options.viewPublic !== false && hasPublicPage && operation.public) {
      main.push({ label: t('admin.viewPublic', 'View public page'), icon: 'i-lucide-external-link', to: links.operation(operation.slug), target: '_blank' })
    }
    const edits: DropdownMenuItem[] = [{
      label: t('admin.edit', 'Edit'),
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        const full = await $fetch<StaffOperation>(operationsApi.admin.operation(operation.id))
        if (await edit(full)) await options.onChanged?.()
      },
    }]
    const moves = nextStatuses(operation.status)
    if (moves.length) {
      edits.push({
        label: t('admin.changeStatus', 'Change status…'),
        icon: 'i-lucide-list-checks',
        children: moves.map(to => ({
          label: t(`admin.statusActions.${to}`, to),
          onSelect: async () => {
            if (await changeStatus(operation, to)) await options.onChanged?.()
          },
        })),
      })
    }
    const extra = options.extra ?? []
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteAction', 'Delete operation'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => {
        if (await remove(operation)) await options.onRemoved?.()
      },
    }]
    return [main, edits, extra, destructive].filter(group => group.length)
  }

  return { create, edit, changeStatus, remove, menu }
}
