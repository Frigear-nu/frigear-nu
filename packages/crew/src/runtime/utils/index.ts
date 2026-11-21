// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './api'
export * from './links'
export * from './status'

export type {
  CreatedCrewInviteDto,
  CrewApplyDto,
  CrewFormOptionDto,
  CrewInviteDto,
  CrewMemberContext,
  CrewMemberDto,
  CrewSettingsDto,
  CrewStatus,
  CrewStatusEmail,
  CrewStatusEmails,
  CrewSubmissionDto,
  ModuleOptions,
  MyCrewDto,
  Translated,
} from '../../types'

/** Random, prefixed id (`civ_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
