import type { DropdownMenuItem } from '@nuxt/ui'
import ShortLinkFormSlideover from '../components/ShortLinkFormSlideover.vue'
import type { ShortLinkDto } from '../../../types'
import { shortLinksApi } from '../../utils/api'
import { shortLinkName } from '../../utils/codes'
import { $fetch, useAction, useConfirmDialog, useCopyToClipboard, useModuleT, useOverlay } from '#imports'

export type ShortLinkMenuOptions = {
  /** Runs after the link was created, edited, disabled or enabled (refresh a list). */
  onChanged?: () => unknown
}

/**
 * What staff can do with a short link: `create` and `edit` (a slideover, links made by hand only), `copy` the short URL,
 * `disable` (confirms first; any link, whoever owns it), `enable` and `menu(link)`, the row menu in the same order
 * everywhere: Open target, Copy short link | Edit, Enable | Disable.
 */
export function useShortLinkActions() {
  const t = useModuleT('shortLinks')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const { copy: write } = useCopyToClipboard()

  /** Opens the create form. Resolves with the new link, or `false` when cancelled. */
  async function create(): Promise<ShortLinkDto | false> {
    return await overlay.create(ShortLinkFormSlideover, { destroyOnClose: true, props: { link: undefined } }).open() as ShortLinkDto | false
  }

  /** Opens the edit form of a link made by hand. Resolves with the saved link, or `false`. */
  async function edit(link: ShortLinkDto): Promise<ShortLinkDto | false> {
    return await overlay.create(ShortLinkFormSlideover, { destroyOnClose: true, props: { link } }).open() as ShortLinkDto | false
  }

  // `shortUrl` is absolute whenever the server knows an origin; a bare path gets this page's origin.
  const absolute = (url: string) => url.startsWith('/') && import.meta.client ? `${window.location.origin}${url}` : url
  const copy = (link: ShortLinkDto) => write(absolute(link.shortUrl), t('admin.copied', 'Copied the short link of {name}', { name: shortLinkName(link) }))

  async function disable(link: ShortLinkDto): Promise<boolean> {
    const name = shortLinkName(link)
    const confirmed = await confirm({
      title: t('admin.disableTitle', 'Disable {name}?', { name }),
      description: link.editable
        ? t('admin.disableDescription', 'People who open it get \'not found\' from now on. You can enable it again.')
        : t('admin.disableOwnedDescription', 'It belongs to {owner}: people who open it, for example from a message already sent, get \'not found\' from now on. You can enable it again.', { owner: link.owner.module }),
      confirmText: t('admin.disableAction', 'Disable short link'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch<ShortLinkDto>(shortLinksApi.admin.disable(link.id), { method: 'POST' }),
      { success: t('admin.disabled', 'Disabled {name}', { name }), error: t('admin.disableFailed', 'Could not disable the short link') },
    )
    return !!done
  }

  async function enable(link: ShortLinkDto): Promise<boolean> {
    const name = shortLinkName(link)
    const done = await run(
      () => $fetch<ShortLinkDto>(shortLinksApi.admin.enable(link.id), { method: 'POST' }),
      { success: t('admin.enabled', 'Enabled {name}', { name }), error: t('admin.enableFailed', 'Could not enable the short link') },
    )
    return !!done
  }

  function menu(link: ShortLinkDto, options: ShortLinkMenuOptions = {}): DropdownMenuItem[][] {
    const changed = async (result: unknown) => {
      if (result) await options.onChanged?.()
    }
    const main: DropdownMenuItem[] = [
      { label: t('admin.openTarget', 'Open target'), icon: 'i-lucide-external-link', to: link.url, target: '_blank', rel: 'noopener noreferrer' },
      { label: t('admin.copy', 'Copy short link'), icon: 'i-lucide-copy', onSelect: () => { void copy(link) } },
    ]
    const edits: DropdownMenuItem[] = []
    if (link.editable) edits.push({ label: t('admin.edit', 'Edit short link'), icon: 'i-lucide-pencil', onSelect: async () => changed(await edit(link)) })
    if (link.disabledAt) edits.push({ label: t('admin.enable', 'Enable short link'), icon: 'i-lucide-circle-play', onSelect: async () => changed(await enable(link)) })
    const destructive: DropdownMenuItem[] = link.disabledAt
      ? []
      : [{ label: t('admin.disableAction', 'Disable short link'), icon: 'i-lucide-ban', color: 'error', onSelect: async () => changed(await disable(link)) }]
    return [main, edits, destructive].filter(group => group.length)
  }

  return { create, edit, copy, disable, enable, menu }
}
