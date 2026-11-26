import type { AuthRoleSource } from '@frigear-nu/auth/utils'
import type { AuthorizationPermissionGrant, AuthorizationPermissionSource, AuthorizationRoleSummaryDto } from '../../utils/api'
import { computed, useLocaleLink, useModuleT, useRuntimeConfig } from '#imports'
import { useRoleLabel } from '../composables/useRoleLabel'

type RoleKind = 'assignable' | 'default' | 'auto' | 'fixed'

// Shared by the roles admin pages and the user tab: how roles, grants and sources read, and where pages live.
export function useRoleLabels() {
  const t = useModuleT('authorization')
  const { localize } = useLocaleLink()
  const config = useRuntimeConfig().public

  const rolesPath = computed(() => localize((config.authorization?.pages?.roles ?? '/admin/roles').replace(/\/+$/, '')))
  const rolePath = (name: string) => `${rolesPath.value}/${encodeURIComponent(name)}`
  const usersAdmin = (config as { users?: { pages?: { admin?: string } } }).users?.pages?.admin
  const userPath = (id: number) => usersAdmin ? `${localize(usersAdmin.replace(/\/+$/, ''))}/${id}` : undefined

  // Roles and permissions name full i18n keys (`labelKey`), in any namespace.
  const { translated, roleLabel } = useRoleLabel()

  const kindOf = (role: Pick<AuthorizationRoleSummaryDto, 'auto' | 'default' | 'assignable'>): RoleKind =>
    role.auto ? 'auto' : role.default ? 'default' : role.assignable ? 'assignable' : 'fixed'
  const kindLabel = (kind: RoleKind) => ({
    assignable: t('admin.kind.assignable', 'Assigned'),
    default: t('admin.kind.default', 'Everyone'),
    auto: t('admin.kind.auto', 'Automatic'),
    fixed: t('admin.kind.fixed', 'Not assignable'),
  })[kind]
  const kindColors = { assignable: 'primary', default: 'neutral', auto: 'info', fixed: 'neutral' } as const

  const sourceLabel = (source: AuthRoleSource) => ({
    manual: t('admin.source.manual', 'Assigned'),
    sso: t('admin.source.sso', 'Single sign-on'),
    migrated: t('admin.source.migrated', 'Migrated'),
  })[source]
  const sourceColors = { manual: 'primary', sso: 'info', migrated: 'neutral' } as const

  /** Why a role holds a permission, in a few words. `labelOf` turns an inherited role's name into its label. */
  const grantLabel = (grant: AuthorizationPermissionGrant, labelOf: (name: string) => string = name => name) => {
    switch (grant.via) {
      case 'granted': return grant.by.includes('*') ? t('admin.grant.wildcard', 'Granted by {grant}', { grant: grant.by }) : t('admin.grant.granted', 'Granted')
      case 'inherited': return t('admin.grant.inherited', 'Inherited from {role}', { role: labelOf(grant.from) })
      case 'implicit': return t('admin.grant.implicit', 'Every signed-in user')
    }
  }
  const grantColors = { granted: 'primary', inherited: 'neutral', implicit: 'info' } as const

  /** The module behind a role or permission, without its npm scope (`@frigear-nu/events` reads `events`); `App` for the app's own. */
  const moduleLabel = (from: string | null | undefined) => from ? from.replace(/^@[^/]+\//, '') : t('admin.app', 'App')

  /** Where a role's grant comes from (auth's provenance): Host config, Module events, Inherited from User. */
  const provenanceLabel = (source: AuthorizationPermissionSource, labelOf: (name: string) => string = name => name) => {
    switch (source.via) {
      case 'host': return t('admin.provenance.host', 'Host config')
      case 'module': return t('admin.provenance.module', 'Module {module}', { module: moduleLabel(source.from) })
      case 'grantTo': return t('admin.provenance.grantTo', 'Default of {module}', { module: moduleLabel(source.from) })
      case 'inherit': return t('admin.provenance.inherit', 'Inherited from {role}', { role: source.from ? labelOf(source.from) : '' }).trim()
    }
  }
  const provenanceColors = { host: 'primary', module: 'info', grantTo: 'success', inherit: 'neutral' } as const

  return { t, translated, moduleLabel, provenanceLabel, provenanceColors, rolesPath, rolePath, userPath, roleLabel, kindOf, kindLabel, kindColors, sourceLabel, sourceColors, grantLabel, grantColors }
}
