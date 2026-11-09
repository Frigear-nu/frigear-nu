import type { RbacGrant, RbacRoleSource } from '../../utils/rbac'
import { computed, useLocaleLink, useModuleT, useRoute, useRouter, useRuntimeConfig } from '#imports'

// Shared by the roles admin pages and the user tab: how a grant, a source and a role read, and where pages live.
export function useRbacLabels() {
  const t = useModuleT('authorization')
  const { localize } = useLocaleLink()
  const config = useRuntimeConfig().public

  const rolesPath = computed(() => localize((config.authorization?.pages?.roles ?? '/admin/roles').replace(/\/+$/, '')))
  const rolePath = (name: string) => `${rolesPath.value}/${encodeURIComponent(name)}`
  const usersAdmin = (config as { users?: { pages?: { admin?: string } } }).users?.pages?.admin
  const userPath = (id: number) => usersAdmin ? `${localize(usersAdmin.replace(/\/+$/, ''))}/${id}` : undefined

  const sourceLabel = (source: RbacRoleSource) => ({
    'built-in': t('admin.source.builtIn', 'Built-in'),
    'module': t('admin.source.module', 'Module'),
    'app': t('admin.source.app', 'App'),
  })[source]
  const sourceColors = { 'built-in': 'neutral', 'module': 'info', 'app': 'primary' } as const

  /** Why a role holds a permission, in a few words. `roleLabel` turns an inherited role's name into its label. */
  const grantLabel = (grant: RbacGrant, roleLabel: (name: string) => string = name => name) => {
    switch (grant.via) {
      case 'direct': return t('admin.grant.direct', 'Direct')
      case 'inherited': return t('admin.grant.inherited', 'Inherited from {role}', { role: roleLabel(grant.from) })
      case 'aggregated': return t('admin.grant.aggregated', 'Aggregated by module')
      case 'granted': return t('admin.grant.granted', 'Granted by app')
      case 'all': return t('admin.grant.all', 'All permissions')
    }
  }
  const grantColors = { direct: 'primary', inherited: 'neutral', aggregated: 'info', granted: 'success', all: 'warning' } as const

  return { t, rolesPath, rolePath, userPath, sourceLabel, sourceColors, grantLabel, grantColors }
}

/** A tab kept in the URL (`?tab=`), so a tab can be linked and survives a reload. The first value is the default. */
export function useQueryTab<T extends string>(values: readonly [T, ...T[]]) {
  const route = useRoute()
  const router = useRouter()
  return computed<T>({
    get: () => values.includes(route.query.tab as T) ? route.query.tab as T : values[0],
    set: (tab) => {
      const query = { ...route.query, tab: tab === values[0] ? undefined : tab, page: undefined }
      router.replace({ query: Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) })
    },
  })
}
