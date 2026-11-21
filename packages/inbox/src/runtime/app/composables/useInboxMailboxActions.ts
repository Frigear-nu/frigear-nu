import type { DropdownMenuItem } from '@nuxt/ui'
import InboxMailboxSlideover from '../components/InboxMailboxSlideover.vue'
import { inboxApi } from '../../utils/api'
import type { InboxMailboxDto } from '../../../types'
import { $fetch, useAction, useConfirmDialog, useInboxTranslate, useModuleT, useOverlay } from '#imports'

/**
 * What staff can do with a mailbox: `create` and `edit` (a slideover, resolving with the saved mailbox), `remove`
 * (confirms first; a mailbox with threads cannot go) and `menu(mailbox)`: Edit | Delete.
 */
export function useInboxMailboxActions() {
  const t = useModuleT('inbox')
  const tr = useInboxTranslate()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()

  const create = async (): Promise<InboxMailboxDto | false> =>
    await overlay.create(InboxMailboxSlideover, { destroyOnClose: true }).open() as InboxMailboxDto | false

  const edit = async (mailbox: InboxMailboxDto): Promise<InboxMailboxDto | false> =>
    await overlay.create(InboxMailboxSlideover, { destroyOnClose: true, props: { mailbox } }).open() as InboxMailboxDto | false

  async function remove(mailbox: InboxMailboxDto): Promise<boolean> {
    const name = tr(mailbox.name)
    const confirmed = await confirm({
      title: t('settings.deleteMailboxTitle', 'Delete {name}?', { name }),
      description: t('settings.deleteMailboxDescription', 'Its channels are disconnected. A mailbox that still has threads cannot be deleted.'),
      confirmText: t('settings.deleteMailbox', 'Delete mailbox'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(inboxApi.admin.mailbox(mailbox.id), { method: 'DELETE' }).then(() => true),
      { success: t('settings.mailboxDeleted', 'Deleted {name}', { name }), error: t('settings.deleteMailboxFailed', 'Could not delete the mailbox') },
    )
    return done === true
  }

  function menu(mailbox: InboxMailboxDto, options: { onChanged?: () => unknown } = {}): DropdownMenuItem[][] {
    return [
      [{
        label: t('settings.editMailbox', 'Edit mailbox'),
        icon: 'i-lucide-pencil',
        onSelect: async () => {
          if (await edit(mailbox)) await options.onChanged?.()
        },
      }],
      [{
        label: t('settings.deleteMailbox', 'Delete mailbox'),
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: async () => {
          if (await remove(mailbox)) await options.onChanged?.()
        },
      }],
    ]
  }

  return { create, edit, remove, menu }
}
