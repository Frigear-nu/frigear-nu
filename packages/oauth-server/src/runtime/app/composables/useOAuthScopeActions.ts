import type { DropdownMenuItem } from '@nuxt/ui'
import type { AdminOAuthScopeDto, OAuthScopeInput } from '../../../types'
import OAuthScopeSlideover from '../components/OAuthScopeSlideover.vue'
import { OAUTH_SCOPES_KEY, oauthScopesApi } from './useOAuthScopes'
import { refreshNuxtData, useAction, useConfirmDialog, useModuleT, useOverlay, useToast } from '#imports'

type SavedScope = AdminOAuthScopeDto | false | undefined

/**
 * Everything you can do to a database scope: `create` / `edit` (a `FormSlideover`), `toggle`, `remove` and
 * `menu(scope)` for the row menu. Scopes of config and modules are read-only: their menu only opens them.
 */
export function useOAuthScopeActions() {
  const t = useModuleT('oauthServer')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const toast = useToast()
  const { busy, run } = useAction()
  const refresh = () => refreshNuxtData(OAUTH_SCOPES_KEY)

  async function create(): Promise<SavedScope> {
    const saved = await overlay.create(OAuthScopeSlideover, {
      destroyOnClose: true,
      props: {
        save: async (input: OAuthScopeInput) => {
          const created = await oauthScopesApi.create(input)
          await refresh()
          return created
        },
      },
    }).open()
    if (saved) toast.add({ title: t('scopes.created', 'Scope created'), description: saved.name, color: 'success', icon: 'i-lucide-check' })
    return saved
  }

  /** Opens the scope's form (read-only for a managed scope). */
  async function edit(scope: AdminOAuthScopeDto): Promise<SavedScope> {
    const saved = await overlay.create(OAuthScopeSlideover, {
      destroyOnClose: true,
      props: {
        scope,
        save: async ({ name: _name, ...input }: OAuthScopeInput) => {
          const updated = await oauthScopesApi.update(scope.name, input)
          await refresh()
          return updated
        },
      },
    }).open()
    if (saved) toast.add({ title: t('scopes.updated', 'Scope updated'), description: saved.name, color: 'success', icon: 'i-lucide-check' })
    return saved
  }

  async function toggle(scope: AdminOAuthScopeDto) {
    await run(async () => {
      await oauthScopesApi.update(scope.name, { isActive: !scope.isActive })
      await refresh()
    }, { success: scope.isActive ? t('scopes.disabledToast', 'Scope disabled') : t('scopes.enabled', 'Scope enabled') })
  }

  async function remove(scope: AdminOAuthScopeDto) {
    const confirmed = await confirm({
      title: t('scopes.deleteTitle', 'Delete the scope {name}?', { name: scope.name }),
      description: t('scopes.deleteDescription', 'Applications asking for it are refused, and signed-in applications lose it at their next refresh. This cannot be undone.'),
      confirmText: t('scopes.delete', 'Delete scope'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(async () => {
      await oauthScopesApi.remove(scope.name)
      await refresh()
      return true
    }, { success: t('scopes.deleted', 'Scope deleted') })
    return done ?? false
  }

  /** Open, the edits, then the destructive action in its own group (database scopes only). */
  const menu = (scope: AdminOAuthScopeDto): DropdownMenuItem[][] => scope.managed
    ? [[{ label: t('scopes.open', 'Open scope'), icon: 'i-lucide-eye', onSelect: () => { void edit(scope) } }]]
    : [[
        { label: t('scopes.edit', 'Edit scope'), icon: 'i-lucide-pencil', onSelect: () => { void edit(scope) } },
        {
          label: scope.isActive ? t('scopes.disable', 'Disable scope') : t('scopes.enable', 'Enable scope'),
          icon: scope.isActive ? 'i-lucide-pause' : 'i-lucide-play',
          onSelect: () => { void toggle(scope) },
        },
      ], [
        { label: t('scopes.delete', 'Delete scope'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void remove(scope) } },
      ]]

  return { busy, create, edit, toggle, remove, menu }
}
