import type { CrewMemberDto, CrewSettingsDto, Translated } from '../../../types'

// The staff views of the admin API's DTOs, and the small shapes of the teams and forms APIs the Crew tab reads (crew does
// not import those modules' app code).
export type StaffCrewMember = CrewMemberDto
export type StaffCrewSettings = CrewSettingsDto

/** One page of `GET /api/admin/crew/operations/:id/members`. */
export type StaffCrewPage = { items: CrewMemberDto[], total: number, page: number, pageSize: number }

/** A team of the operation, as `GET /api/admin/teams?ownerType=operation&ownerId=...` answers (the fields used here). */
export type CrewTeamOption = { id: string, kind: string, name: Translated, memberCount: number }
/** A ladder as `GET /api/admin/teams/ladders` answers (the fields used here). */
export type CrewLadder = { kind: string, roles: Array<{ key: string, label: Translated }>, leadFrom: string | null }
/** A form of the forms list (`GET /api/admin/forms`, the fields used here). */
export type CrewFormOption = { id: string, name: string, slug: string, status: string }

type TranslateText = (value: Translated | null | undefined) => string

/** The select options of a kind's ladder, highest role first. */
export function crewRoleOptions(ladders: readonly CrewLadder[] | null | undefined, kind: string | undefined, tr: TranslateText) {
  const ladder = ladders?.find(item => item.kind === kind)
  return [...(ladder?.roles ?? [])].reverse().map(role => ({ label: tr(role.label) || role.key, value: role.key }))
}

/** The label of a role key on a ladder, falling back to the key. */
export function crewRoleLabel(ladders: readonly CrewLadder[] | null | undefined, kind: string | undefined, role: string, tr: TranslateText): string {
  const found = ladders?.find(ladder => ladder.kind === kind)?.roles.find(item => item.key === role)
  return found ? tr(found.label) || role : role
}

/** `datetime-local` inputs want the local time without a zone, not the stored ISO instant. */
export const toLocalInput = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/** A `datetime-local` value as the ISO instant the API wants; a value that still equals the stored instant keeps it. */
export const localToIso = (value: string, stored?: string | null): string | null => {
  if (!value) return null
  if (stored && toLocalInput(stored) === value) return stored
  return new Date(value).toISOString()
}

/** Whether a translated value holds no text in any language. */
export function isEmptyTranslated(value: Translated | null | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return !value.trim()
  return !Object.values(value).some(text => text.trim())
}
