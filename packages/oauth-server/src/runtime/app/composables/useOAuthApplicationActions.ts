import type { DropdownMenuItem } from '@nuxt/ui'
import type { AdminApplicationDto, ApplicationInput, CreatedApplicationDto } from '../../../types'
import OAuthApplicationSlideover from '../components/OAuthApplicationSlideover.vue'
import OAuthCredentialsModal from '../components/OAuthCredentialsModal.vue'
import { OAUTH_APPLICATIONS_KEY, oauthApplicationsApi } from './useOAuthApplications'

type SavedApplication = AdminApplicationDto | CreatedApplicationDto | false | undefined

/**
 * Everything you can do to an application: `create` / `edit` (a `FormSlideover`), `remove`, `toggle`, `rotateSecret`,
 * `signOutEveryone`, `copyClientId` and `menu(application)` for the row menu. Toasts, confirmations and the refresh
 * of the admin list are handled here.
 */
export function useOAuthApplicationActions() {
  const t = useModuleT('oauthServer')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const toast = useToast()
  const { busy, run } = useAction()
  const { copy } = useCopyToClipboard()

  const refresh = () => refreshNuxtData(OAUTH_APPLICATIONS_KEY)

  /** Shows the client secret once. */
  function showCredentials(credentials: { name: string, clientId: string, clientSecret: string }) {
    overlay.create(OAuthCredentialsModal, { destroyOnClose: true, props: credentials }).open()
  }

  /** Opens the form to add an application. Resolves with the application, or `false` when cancelled. */
  async function create(): Promise<SavedApplication> {
    const saved = await overlay.create(OAuthApplicationSlideover, {
      destroyOnClose: true,
      props: {
        save: async (input: ApplicationInput) => {
          const created = await oauthApplicationsApi.create(input)
          await refresh()
          return created
        },
      },
    }).open()
    if (saved && 'clientSecret' in saved) {
      toast.add({ title: t('admin.created', 'Application created'), description: saved.name, color: 'success', icon: 'i-lucide-check' })
      showCredentials({ name: saved.name, clientId: saved.clientId, clientSecret: saved.clientSecret })
    }
    return saved
  }

  /** Opens the form to edit an application. Resolves with the application, or `false` when cancelled. */
  async function edit(application: AdminApplicationDto): Promise<SavedApplication> {
    const saved = await overlay.create(OAuthApplicationSlideover, {
      destroyOnClose: true,
      props: {
        application,
        save: async (input: ApplicationInput) => {
          const updated = await oauthApplicationsApi.update(application.id, input)
          await refresh()
          return updated
        },
      },
    }).open()
    if (saved) toast.add({ title: t('admin.updated', 'Application updated'), description: saved.name, color: 'success', icon: 'i-lucide-check' })
    return saved
  }

  async function remove(application: AdminApplicationDto) {
    const confirmed = await confirm({
      title: t('admin.deleteTitle', 'Delete {name}?', { name: application.name }),
      description: t('admin.deleteDescription', 'Users can no longer sign in to it and every active sign-in ends. This cannot be undone.'),
      confirmText: t('admin.delete', 'Delete application'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(async () => {
      await oauthApplicationsApi.remove(application.id)
      await refresh()
      return true
    }, { success: t('admin.deleted', 'Application deleted') })
    return done ?? false
  }

  async function toggle(application: AdminApplicationDto) {
    await run(async () => {
      await oauthApplicationsApi.update(application.id, { isActive: !application.isActive })
      await refresh()
    }, { success: application.isActive ? t('admin.disabledToast', 'Application disabled') : t('admin.enabled', 'Application enabled') })
  }

  async function rotateSecret(application: AdminApplicationDto) {
    const confirmed = await confirm({
      title: t('admin.rotateTitle', 'Replace the client secret of {name}?', { name: application.name }),
      description: t('admin.rotateDescription', 'The old secret stops working and everyone is signed out of the application.'),
      confirmText: t('admin.newSecret', 'New client secret'),
      destructive: true,
    })
    if (!confirmed) return
    const clientSecret = await run(async () => {
      const secret = await oauthApplicationsApi.rotateSecret(application.id)
      await refresh()
      return secret
    }, { success: t('admin.secretReplaced', 'Client secret replaced') })
    if (clientSecret) showCredentials({ name: application.name, clientId: application.id, clientSecret })
  }

  async function signOutEveryone(application: AdminApplicationDto) {
    const confirmed = await confirm({
      title: t('admin.signOutTitle', 'Sign everyone out of {name}?', { name: application.name }),
      description: t('admin.signOutDescription', 'Their sessions in the application end. They can sign in again.'),
      confirmText: t('admin.signOutEveryone', 'Sign everyone out'),
      destructive: true,
    })
    if (!confirmed) return
    await run(async () => {
      await oauthApplicationsApi.revokeGrants(application.id)
      await refresh()
    }, { success: t('admin.signedOut', 'Everyone signed out') })
  }

  const copyClientId = (application: AdminApplicationDto) => copy(application.id, t('credentials.copiedClientId', 'Client ID copied'))

  /** The row menu: edits, then the destructive action in its own group. */
  const menu = (application: AdminApplicationDto): DropdownMenuItem[][] => [[
    { label: t('admin.edit', 'Edit application'), icon: 'i-lucide-pencil', onSelect: () => { void edit(application) } },
    { label: t('admin.copyClientId', 'Copy client ID'), icon: 'i-lucide-copy', onSelect: () => { void copyClientId(application) } },
    {
      label: application.isActive ? t('admin.disable', 'Disable application') : t('admin.enable', 'Enable application'),
      icon: application.isActive ? 'i-lucide-pause' : 'i-lucide-play',
      onSelect: () => { void toggle(application) },
    },
    { label: t('admin.newSecret', 'New client secret'), icon: 'i-lucide-key-round', onSelect: () => { void rotateSecret(application) } },
    { label: t('admin.signOutEveryone', 'Sign everyone out'), icon: 'i-lucide-log-out', onSelect: () => { void signOutEveryone(application) } },
  ], [
    { label: t('admin.delete', 'Delete application'), icon: 'i-lucide-trash', color: 'error', onSelect: () => { void remove(application) } },
  ]]

  return { busy, create, edit, remove, toggle, rotateSecret, signOutEveryone, copyClientId, menu }
}
