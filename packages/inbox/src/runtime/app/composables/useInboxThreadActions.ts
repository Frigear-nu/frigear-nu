import type { DropdownMenuItem } from '@nuxt/ui'
import InboxHideSlideover from '../components/InboxHideSlideover.vue'
import { inboxApi } from '../../utils/api'
import { INBOX_STATUS_LABELS } from '../../utils'
import type { InboxContactDto, InboxContactExportDto, InboxThreadDto, InboxThreadStatus } from '../../../types'
import { $fetch, useAction, useConfirmDialog, useInboxLinks, useModuleT, useOverlay, useUserSession } from '#imports'

export type InboxThreadMenuOptions = {
  /** Runs after the thread changed (refresh a list or the page). */
  onChanged?: () => unknown
  /** Leave out "Open", e.g. on the thread's own page. Defaults to `true`. */
  open?: boolean
  /** What the caller may do; without it every action is offered and the API decides. */
  can?: { reply?: boolean, assign?: boolean, hide?: boolean }
  /** The roles the caller may hide the thread below. */
  hideRoles?: string[]
}

/**
 * What staff can do with a thread, shared by the list and the thread page: `setStatus`, `assign` (`null` unassigns),
 * `hide` (a slideover with the caller's roles), `exportContact`, `eraseContact` (confirms first) and `menu(thread)`:
 * Open | Assign to me, Close or Reopen, Hide.
 */
export function useInboxThreadActions() {
  const t = useModuleT('inbox')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const links = useInboxLinks()
  const { user } = useUserSession()

  const myId = () => (user.value?.id !== undefined ? Number(user.value.id) : undefined)
  const subjectOf = (thread: Pick<InboxThreadDto, 'subject'>) => thread.subject || t('thread.noSubject', '(no subject)')

  async function setStatus(thread: InboxThreadDto, status: InboxThreadStatus): Promise<InboxThreadDto | undefined> {
    return run(
      () => $fetch<InboxThreadDto>(inboxApi.admin.thread(thread.id), { method: 'PATCH', body: { status } }),
      { success: t(`thread.statusChanged.${status}`, `Marked {subject} as ${(INBOX_STATUS_LABELS[status] ?? status).toLowerCase()}`, { subject: subjectOf(thread) }) },
    )
  }

  async function assign(thread: InboxThreadDto, assigneeId: number | null): Promise<InboxThreadDto | undefined> {
    return run(
      () => $fetch<InboxThreadDto>(inboxApi.admin.thread(thread.id), { method: 'PATCH', body: { assigneeId } }),
      { success: assigneeId === null ? t('thread.unassigned', 'Unassigned {subject}', { subject: subjectOf(thread) }) : t('thread.assigned', 'Assigned {subject}', { subject: subjectOf(thread) }) },
    )
  }

  const hide = async (thread: InboxThreadDto, roles: string[]): Promise<InboxThreadDto | false> =>
    await overlay.create(InboxHideSlideover, { destroyOnClose: true, props: { thread, roles } }).open() as InboxThreadDto | false

  /** Downloads everything stored about the contact as JSON (GDPR access request). */
  async function exportContact(contact: InboxContactDto): Promise<boolean> {
    const data = await run(
      () => $fetch<InboxContactExportDto>(inboxApi.admin.contactExport(contact.id)),
      { success: t('contact.exported', 'Exported {name}', { name: contact.name ?? contact.id }), error: t('contact.exportFailed', 'Could not export the contact') },
    )
    if (!data) return false
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const anchor = Object.assign(document.createElement('a'), { href: url, download: `inbox-contact-${contact.id}.json` })
    anchor.click()
    URL.revokeObjectURL(url)
    return true
  }

  async function eraseContact(contact: InboxContactDto): Promise<boolean> {
    const name = contact.name ?? t('contact.unnamed', 'this contact')
    const confirmed = await confirm({
      title: t('contact.eraseTitle', 'Erase {name}?', { name }),
      description: t('contact.eraseDescription', 'Their name, email address and phone number are removed and every message in their threads is blanked. The threads stay, empty. This cannot be undone.'),
      confirmText: t('contact.erase', 'Erase contact'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(inboxApi.admin.contactErase(contact.id), { method: 'POST' }).then(() => true),
      { success: t('contact.erased', 'Erased {name}', { name }), error: t('contact.eraseFailed', 'Could not erase the contact') },
    )
    return done === true
  }

  function menu(thread: InboxThreadDto, options: InboxThreadMenuOptions = {}): DropdownMenuItem[][] {
    const can = options.can ?? { reply: true, assign: true, hide: true }
    const changed = async (result: unknown) => {
      if (result) await options.onChanged?.()
    }
    const open: DropdownMenuItem[] = []
    const to = links.thread(thread.id)
    if (options.open !== false && to) open.push({ label: t('thread.open', 'Open thread'), icon: 'i-lucide-arrow-right', to })
    const edits: DropdownMenuItem[] = []
    const me = myId()
    if (can.assign && me !== undefined) {
      edits.push(thread.assigneeId === me
        ? { label: t('thread.unassign', 'Unassign thread'), icon: 'i-lucide-user-minus', onSelect: async () => changed(await assign(thread, null)) }
        : { label: t('thread.assignToMe', 'Assign thread to me'), icon: 'i-lucide-user-check', onSelect: async () => changed(await assign(thread, me)) })
    }
    if (can.reply) {
      edits.push(thread.status === 'closed'
        ? { label: t('thread.reopen', 'Reopen thread'), icon: 'i-lucide-rotate-ccw', onSelect: async () => changed(await setStatus(thread, 'open')) }
        : { label: t('thread.close', 'Close thread'), icon: 'i-lucide-check', onSelect: async () => changed(await setStatus(thread, 'closed')) })
    }
    if (can.hide) {
      edits.push({ label: t('thread.hide', 'Hide from lower roles'), icon: 'i-lucide-eye-off', onSelect: async () => changed(await hide(thread, options.hideRoles ?? [])) })
    }
    return [open, edits].filter(group => group.length)
  }

  return { setStatus, assign, hide, exportContact, eraseContact, menu }
}
