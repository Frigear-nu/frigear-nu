// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './api'
export * from './claims'
export * from './ladders'
export * from './links'
export * from './resolve'

export type {
  AdminTeamDto,
  ModuleOptions,
  MyTeamDto,
  TeamDto,
  TeamLadder,
  TeamLadderDto,
  TeamLadderRole,
  TeamMemberContext,
  TeamMemberDto,
  TeamMemberRoleChangedContext,
  TeamOwner,
  TeamRoleMappingDto,
  TeamRoleMatch,
  TeamsClaimEntry,
  TeamsMappedGrant,
  TeamsMembersCandidatesContext,
  TeamsResolverTeam,
  TeamsRolesResolveContext,
  TeamUserLookupDto,
  Translated,
} from '../../types'

/** Random, prefixed id (`tem_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
