import type { DropdownMenuItem } from '@nuxt/ui'
import InboxChannelSlideover from '../components/InboxChannelSlideover.vue'
import { inboxApi } from '../../utils/api'
import type { InboxChannelAccountDto, InboxMailboxDto } from '../../../types'
import { $fetch, useAction, useConfirmDialog, useModuleT, useOverlay } from '#imports'

/**
 * What staff can do with a channel account: `create` and `edit` (a slideover), `toggle` (turn it on or off),
 * `remove` (confirms first) and `menu(account)`: Edit, Turn off | Disconnect.
 */
export function useInboxChannelActions() {
  const t = useModuleT('inbox')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()

  const create = async (mailboxes: InboxMailboxDto[]): Promise<InboxChannelAccountDto | false> =>
    await overlay.create(InboxChannelSlideover, { destroyOnClose: true, props: { mailboxes } }).open() as InboxChannelAccountDto | false

  const edit = async (account: InboxChannelAccountDto, mailboxes: InboxMailboxDto[]): Promise<InboxChannelAccountDto | false> =>
    await overlay.create(InboxChannelSlideover, { destroyOnClose: true, props: { account, mailboxes } }).open() as InboxChannelAccountDto | false

  async function toggle(account: InboxChannelAccountDto): Promise<boolean> {
    const done = await run(
      () => $fetch(inboxApi.admin.channel(account.id), { method: 'PATCH', body: { enabled: !account.enabled } }).then(() => true),
      { success: account.enabled ? t('settings.channelOff', 'Turned off {address}', { address: account.address }) : t('settings.channelOn', 'Turned on {address}', { address: account.address }) },
    )
    return done === true
  }

  async function remove(account: InboxChannelAccountDto): Promise<boolean> {
    const confirmed = await confirm({
      title: t('settings.disconnectTitle', 'Disconnect {address}?', { address: account.address }),
      description: t('settings.disconnectDescription', 'New messages to it are dropped. Its threads stay in the mailbox, but replies to them can no longer be sent.'),
      confirmText: t('settings.disconnect', 'Disconnect channel'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(inboxApi.admin.channel(account.id), { method: 'DELETE' }).then(() => true),
      { success: t('settings.disconnected', 'Disconnected {address}', { address: account.address }), error: t('settings.disconnectFailed', 'Could not disconnect the channel') },
    )
    return done === true
  }

  function menu(account: InboxChannelAccountDto, mailboxes: InboxMailboxDto[], options: { onChanged?: () => unknown } = {}): DropdownMenuItem[][] {
    const changed = async (result: unknown) => {
      if (result) await options.onChanged?.()
    }
    return [
      [
        { label: t('settings.editChannel', 'Edit channel'), icon: 'i-lucide-pencil', onSelect: async () => changed(await edit(account, mailboxes)) },
        account.enabled
          ? { label: t('settings.turnOff', 'Turn off channel'), icon: 'i-lucide-pause', onSelect: async () => changed(await toggle(account)) }
          : { label: t('settings.turnOn', 'Turn on channel'), icon: 'i-lucide-play', onSelect: async () => changed(await toggle(account)) },
      ],
      [{ label: t('settings.disconnect', 'Disconnect channel'), icon: 'i-lucide-trash-2', color: 'error', onSelect: async () => changed(await remove(account)) }],
    ]
  }

  return { create, edit, toggle, remove, menu }
}
