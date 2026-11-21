import type { H3Event } from 'h3'
import type { Translated } from '@frigear-nu/ui/translated'

export type { Translated }

/**
 * Where a person stands in an operation's crew. Teams' own `status` follows it: `applied` and `waitlisted` are
 * `pending`, `approved` is `active`, `rejected` and `withdrawn` are `inactive`. Only an approved person holds the role.
 */
export type CrewStatus = 'applied' | 'waitlisted' | 'approved' | 'rejected' | 'withdrawn'

/** The email of one status: `enabled: false` turns it off, `subject` and `body` replace the built-in text. */
export type CrewStatusEmail = {
  enabled?: boolean
  /** May use `{{name}}`, `{{operation}}`, `{{team}}`, `{{role}}` and `{{status}}`. */
  subject?: Translated
  /** Plain text, with the same variables. Replaces the built-in message of the template. */
  body?: Translated
}

/** The emails sent when a person's crew status changes, per status. A status left out sends the built-in email. */
export type CrewStatusEmails = Partial<Record<CrewStatus, CrewStatusEmail>>

export type ModuleOptions = {
  settings?: {
    pages?: {
      /** The page volunteers apply on, with the operation's form; must contain an `:operationSlug` param. On by default (`/crew/apply/:operationSlug`), `false` turns it off. */
      apply?: string | boolean
      /** The page that shows a volunteer's crew status per operation and lets them withdraw. On by default (`/crew/status`), `false` turns it off. */
      status?: string | boolean
      /** The page that accepts an invite link; must contain a `:token` param. On by default (`/crew/invite/:token`), `false` turns it off. */
      invite?: string | boolean
    }
    /**
     * Add a "Crew" tab to the `admin.operations` tab area (when `@frigear-nu/widget` and `@frigear-nu/admin` are
     * installed). Defaults to `true`; harmless when nothing renders the area.
     */
    operationsTab?: boolean
  }
  /**
   * The key of a subscription plan whose active subscribers are volunteers of every operation with presets: crew adds a
   * `plan` mapping rule for it next to the global-role presets. Left out: no plan rule.
   */
  memberPlan?: string
  /** The key of the application form field that holds the phone number, stored on the user. Defaults to `phone`. */
  phoneField?: string
}

export type PublicModuleOptions = {
  pages: { apply?: string, status?: string, invite?: string }
}

/** The private runtime config of crew (`runtimeConfig.crew`). */
export type CrewRuntimeConfig = {
  memberPlan: string | null
  phoneField: string
}

/** One person in an operation's crew, as staff see them (`/api/admin/crew/operations/:id/members`). */
export type CrewMemberDto = {
  /** The membership row's id (`tmm_...`, teams' `team_members`). */
  id: string
  operationId: string
  teamId: string
  teamName: Translated
  userId: number
  name: string | null
  avatar: string | null
  /** Only with `crew:pii`; otherwise left out. */
  email?: string | null
  /** Only with `crew:pii`; otherwise left out. */
  phone?: string | null
  /** A role of the team kind's ladder. */
  role: string
  crewStatus: CrewStatus
  /** Place on the waiting list, 1 first; `null` when not waitlisted. */
  waitlistPosition: number | null
  /** Approved in an earlier operation. */
  previousCrew: boolean
  appliedAt: string | null
  decidedAt: string | null
  decidedBy: number | null
  /** The forms submission of the application (its answers need `crew:pii`). */
  submissionId: string | null
}

/** My crew status in one operation (`GET /api/crew/me`). */
export type MyCrewDto = {
  operationId: string
  operationSlug: string
  operationName: Translated
  crewStatus: CrewStatus
  teamId: string
  teamName: Translated
  role: string
  waitlistPosition: number | null
  appliedAt: string | null
  decidedAt: string | null
}

/** What the apply page needs (`GET /api/crew/operations/:operation/apply`). */
export type CrewApplyDto = {
  operationId: string
  operationSlug: string
  operationName: Translated
  /**
   * `open`: apply now. `scheduled`: opens later (`opensAt`). `closed`: the window or the operation is over.
   * `unavailable`: no application form is set up. `applied`: already applied, waitlisted or approved (`crewStatus`).
   * `rejected`: the application was turned down. `member`: already on a team of the operation.
   */
  state: 'open' | 'scheduled' | 'closed' | 'unavailable' | 'applied' | 'rejected' | 'member'
  crewStatus: CrewStatus | null
  /** The slug of the form to render, while the state is `open`. */
  formSlug: string | null
  opensAt: string | null
  closesAt: string | null
}

/** How an operation's crew is recruited (`/api/admin/crew/operations/:id/settings`). */
export type CrewSettingsDto = {
  operationId: string
  formId: string | null
  defaultTeamId: string | null
  capacity: number | null
  waitlist: boolean
  previousCrewFirst: boolean
  opensAt: string | null
  closesAt: string | null
  statusEmails: CrewStatusEmails
  presets: boolean
  /** `stored`: a row of `crew_settings`. `default`: nothing saved yet. */
  source: 'stored' | 'default'
  /** Approved crew, for the capacity. */
  approved: number
  createdAt: string | null
  updatedAt: string | null
}

/** An invite link as staff see it. The token is only in {@link CreatedCrewInviteDto}. */
export type CrewInviteDto = {
  id: string
  operationId: string
  teamId: string
  teamName: Translated | null
  role: string
  /** First characters of the token. */
  prefix: string
  maxUses: number
  uses: number
  expiresAt: string | null
  createdBy: number | null
  createdAt: string
  revokedAt: string | null
  status: 'active' | 'used' | 'expired' | 'revoked'
}

/** The answer of creating an invite: the token is shown this once and never stored. */
export type CreatedCrewInviteDto = CrewInviteDto & {
  token: string
  /** The invite page with the token filled in; `null` when the invite page is turned off. */
  path: string | null
}

/** The answers of an application, rendered with the form's labels (`GET /api/admin/crew/members/:id/submission`). */
export type CrewSubmissionDto = {
  id: string
  formSlug: string
  createdAt: string
  locale: string
  answers: Array<{ key: string, label: string, value: string }>
}

/** Context of the `crew:member:*` hooks. `member` has the contact details (listeners are server side). */
export type CrewMemberContext = {
  event: H3Event
  operationId: string
  member: CrewMemberDto
}
