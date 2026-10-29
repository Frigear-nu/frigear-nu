import type { DropdownMenuItem } from '@nuxt/ui'
import UserCreateSlideover from '../components/UserCreateSlideover.vue'
import type { UserRow, UserSubject } from '../utils/admin-user'
import { ADMIN_USERS_KEY } from '../utils/admin-user'

export interface UserMenuOptions {
  /** Extra groups between the sign-in link and the destructive group (modules add theirs here). */
  extra?: DropdownMenuItem[][]
  /** Runs after the user was deleted; without it the users list is refreshed. */
  onRemoved?: () => void | Promise<void>
  /** Leave out "Open", e.g. on the user's own page. Default `true`. */
  open?: boolean
  /** Hide the entries the acting staff member may not use (known on the detail page). Both default to `true`. */
  can?: { update?: boolean, delete?: boolean }
}

/**
 * Everything staff do to a user: `create` (a slideover, then the new user's page), `remove` (confirm, toast, refresh) and `menu(user)` for the
 * `RowMenu` of the list rows and the detail heading, ordered Open, sign-in link, extras, then Delete in its own group.
 */
export function useUserActions() {
  const t = useModuleT('users')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const { localize } = useLocaleLink()

  const adminPage = useRuntimeConfig().public.users?.pages?.admin ?? '/admin/users'
  /** The users list. */
  const listPath = computed(() => localize(adminPage.replace(/\/+$/, '')))
  /** The admin page of one user. */
  const userPath = (id: number) => `${listPath.value}/${id}`

  /** Opens the create form, then opens the new user's page; resolves with the created user, or `false` when cancelled. */
  async function create(options: { roles?: string[] } = {}): Promise<UserRow | false> {
    const created = await overlay.create(UserCreateSlideover).open({ roles: options.roles ?? [] }) as UserRow | false
    if (created) await navigateTo(userPath(created.id))
    return created
  }

  /** Confirms, deletes and refreshes. Resolves `true` once the user is gone. */
  async function remove(user: UserSubject, options: Pick<UserMenuOptions, 'onRemoved'> = {}): Promise<boolean> {
    const confirmed = await confirm({
      title: t('admin.deleteTitle', 'Delete {name}?', { name: user.name }),
      description: t('admin.deleteBody', 'This permanently removes the account and its sign-in methods. It cannot be undone.'),
      confirmText: t('admin.deleteUser', 'Delete user'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' }).then(() => true),
      { success: t('admin.deleted', 'User deleted.') },
    )
    if (!done) return false
    if (options.onRemoved) await options.onRemoved()
    else await refreshNuxtData(ADMIN_USERS_KEY)
    return true
  }

  /** Emails the sign-in link (or, for an unverified address, the verification email) again. */
  async function resend(user: UserSubject): Promise<boolean> {
    const sent = await run(
      () => $fetch(`/api/admin/users/${user.id}/resend`, { method: 'POST' }).then(() => true),
      { success: t('admin.resent', 'Sign-in link sent.') },
    )
    return !!sent
  }

  /** `RowMenu` items: Open, then the sign-in link, then `extra`, then Delete in its own red group. */
  function menu(user: UserSubject, options: UserMenuOptions = {}): DropdownMenuItem[][] {
    const canUpdate = options.can?.update ?? true
    const canDelete = options.can?.delete ?? true
    const groups: DropdownMenuItem[][] = []

    const first: DropdownMenuItem[] = []
    if (options.open !== false) {
      first.push({ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: userPath(user.id) })
    }
    if (canUpdate) {
      first.push({
        label: user.emailVerifiedAt ? t('admin.resendLink', 'Resend sign-in link') : t('admin.sendVerification', 'Resend verification email'),
        icon: 'i-lucide-mail',
        onSelect: () => { void resend(user) },
      })
    }
    if (first.length) groups.push(first)
    groups.push(...(options.extra ?? []).filter(group => group.length))
    if (canDelete) {
      groups.push([{
        label: t('admin.deleteUser', 'Delete user'),
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => { void remove(user, { onRemoved: options.onRemoved }) },
      }])
    }
    return groups
  }

  return { listPath, userPath, create, remove, resend, menu }
}
