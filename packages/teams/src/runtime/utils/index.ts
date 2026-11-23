// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './api'
export * from './claims'
export * from './grants'
export * from './ladders'
export * from './links'
export * from './resolve'

export type {
  AdminTeamDto,
  ModuleOptions,
  MyTeamDto,
  OwnerRef,
  OwnerType,
  TeamDto,
  TeamGrant,
  TeamIdGrant,
  TeamKindGrant,
  TeamLadder,
  TeamLadderDto,
  TeamLadderRole,
  TeamMemberContext,
  TeamMemberDto,
  TeamMemberRoleChangedContext,
  TeamOwner,
  TeamRoleGrant,
  TeamRoleMappingDto,
  TeamRoleMatch,
  TeamsClaimEntry,
  TeamsMappedGrant,
  TeamsMembersCandidatesContext,
  TeamsOwnerResolveContext,
  TeamsResolverTeam,
  TeamsRolesResolveContext,
  TeamUserLookupDto,
  Translated,
} from '../../types'

/** Random, prefixed id (`<prefix>_<32 hex>`): the one of `@frigear-nu/module-kit/id`. */
export { newId } from '@frigear-nu/module-kit/id'
