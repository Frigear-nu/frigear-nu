// Typed path builders of the shifts HTTP API. App code, tests and docs use these instead of string literals, so a changed
// URL is changed in one place. Every id is URL-encoded.

const enc = encodeURIComponent

/** Volunteer and lead routes, under `/api/shifts`. */
const BASE = '/api/shifts'
/** Staff routes, under `/api/admin/shifts`. */
const ADMIN_BASE = '/api/admin/shifts'

export const shiftsApi = {
  me: {
    /** `GET` my shifts in published schedules (`?from&to`, ISO instants). */
    shifts: `${BASE}/me`,
    /** `GET` one of my shifts: the shift, the lead on duty and my swap. */
    shift: (assignmentId: string) => `${BASE}/me/${enc(assignmentId)}`,
    /** `GET` the QR pass of one of my shifts (the code only while check-in is open). */
    pass: (assignmentId: string) => `${BASE}/me/${enc(assignmentId)}/pass`,
    /** `POST` to open a swap of one of my shifts, `DELETE` to withdraw it. */
    swap: (assignmentId: string) => `${BASE}/me/${enc(assignmentId)}/swap`,
    /** `GET` the teams I work on that have a shift running now, with who is on it. */
    now: `${BASE}/me/now`,
    /** `GET` the teams I lead. */
    leads: `${BASE}/me/leads`,
    /** `GET` whether I have a calendar feed, `POST` to mint one (shown once, revokes the old one), `DELETE` to revoke it. Session only. */
    feedToken: `${BASE}/me/feed-token`,
  },
  /** `GET` a person's shifts as an iCal feed; the secret token is the credential (`.ics` suffix optional). Public. */
  feed: (token: string) => `${BASE}/feed/${enc(token)}.ics`,
  /** `GET` the open swaps I can take. */
  swaps: `${BASE}/swaps`,
  /** `POST` `{ assignmentId? }` to offer to take a swap (optionally giving one of my shifts back). */
  offers: (swapId: string) => `${BASE}/swaps/${enc(swapId)}/offers`,
  /** `DELETE` to withdraw my offer. */
  offer: (swapId: string, offerId: string) => `${BASE}/swaps/${enc(swapId)}/offers/${enc(offerId)}`,
  /** `POST` (the swap's owner) to accept an offer. */
  acceptOffer: (swapId: string, offerId: string) => `${BASE}/swaps/${enc(swapId)}/offers/${enc(offerId)}/accept`,
  /** `POST` (the swap's owner) to reject an offer. */
  rejectOffer: (swapId: string, offerId: string) => `${BASE}/swaps/${enc(swapId)}/offers/${enc(offerId)}/reject`,
  /** `POST` (a lead of the team, or staff) to approve a swap waiting for approval. */
  approveSwap: (swapId: string) => `${BASE}/swaps/${enc(swapId)}/approve`,
  /** `POST` (a lead of the team, or staff) to reject a swap waiting for approval: it is open again. */
  rejectSwap: (swapId: string) => `${BASE}/swaps/${enc(swapId)}/reject`,
  teams: {
    /** `POST` `{ code }` to check a person in with their QR pass (a lead of the team, or staff). */
    checkIn: (teamId: string) => `${BASE}/teams/${enc(teamId)}/check-in`,
    /** `GET` (`?from&to`) the team's shifts in published schedules with who works them (a lead of the team, or staff). */
    shifts: (teamId: string) => `${BASE}/teams/${enc(teamId)}/shifts`,
    /** `GET` (`?status`) the team's swaps, e.g. those waiting for approval (a lead of the team, or staff). */
    swaps: (teamId: string) => `${BASE}/teams/${enc(teamId)}/swaps`,
    /** `POST` `{ audience?, channels?, subject, message }` to message the team (a lead of it, or staff). Email unless `channels` adds `sms`. */
    broadcasts: (teamId: string) => `${BASE}/teams/${enc(teamId)}/broadcasts`,
    /** `GET` the perks the team's leads can redeem (a lead of the team, or staff). */
    perks: (teamId: string) => `${BASE}/teams/${enc(teamId)}/perks`,
    /** `POST` `{ code }` to redeem a perk with a person's QR pass (a lead of the team, or staff). */
    redeemPerk: (teamId: string, perkId: string) => `${BASE}/teams/${enc(teamId)}/perks/${enc(perkId)}/redeem`,
  },
  /** `POST` to mark an assignment attended (a lead of the team, or staff). */
  attended: (assignmentId: string) => `${BASE}/assignments/${enc(assignmentId)}/attended`,
  /** `POST` to mark an assignment a no-show (a lead of the team, or staff). */
  noShow: (assignmentId: string) => `${BASE}/assignments/${enc(assignmentId)}/no-show`,
  /** `GET` who is on shift now in an operation, and the leads on duty per team. */
  now: (operationId: string) => `${BASE}/operations/${enc(operationId)}/now`,
  /** `GET` the `shifts.on-duty` live layer: GeoJSON points on the operation's venue layout, a team per shift location. */
  onDuty: (operationId: string) => `${BASE}/operations/${enc(operationId)}/on-duty`,
  admin: {
    /** `GET` (`?operationId`) / `POST` schedules. */
    schedules: `${ADMIN_BASE}/schedules`,
    /** `GET` / `PATCH` / `DELETE` one schedule. */
    schedule: (scheduleId: string) => `${ADMIN_BASE}/schedules/${enc(scheduleId)}`,
    /** `POST` to publish a draft schedule. */
    publish: (scheduleId: string) => `${ADMIN_BASE}/schedules/${enc(scheduleId)}/publish`,
    /** `POST` `{ scheduleId, offsetDays }` to copy another schedule's roles and shifts into this one. */
    copyFrom: (scheduleId: string) => `${ADMIN_BASE}/schedules/${enc(scheduleId)}/copy-from`,
    /** `GET` / `POST` a schedule's shift roles. */
    roles: (scheduleId: string) => `${ADMIN_BASE}/schedules/${enc(scheduleId)}/roles`,
    /** `PATCH` / `DELETE` one shift role. */
    role: (roleId: string) => `${ADMIN_BASE}/roles/${enc(roleId)}`,
    /** `GET` (`?teamId&from&to`) a schedule's shifts with their assignments. */
    shifts: (scheduleId: string) => `${ADMIN_BASE}/schedules/${enc(scheduleId)}/shifts`,
    /** `POST` `{ teamId, days, slots, capacity?, shiftRoleId? }` to create shifts in bulk. */
    bulk: (scheduleId: string) => `${ADMIN_BASE}/schedules/${enc(scheduleId)}/shifts/bulk`,
    /** `PATCH` / `DELETE` one shift. */
    shift: (shiftId: string) => `${ADMIN_BASE}/${enc(shiftId)}`,
    /** `POST` `{ userId, shiftRoleId?, force? }` to assign a person to a shift. */
    assignments: (shiftId: string) => `${ADMIN_BASE}/${enc(shiftId)}/assignments`,
    /** `GET` (`?q`) the people of the shift's team staff could assign, with the guards they would break. */
    candidates: (shiftId: string) => `${ADMIN_BASE}/${enc(shiftId)}/candidates`,
    /** `DELETE` to cancel an assignment. */
    assignment: (assignmentId: string) => `${ADMIN_BASE}/assignments/${enc(assignmentId)}`,
    /** `GET` (`?operationId&status`) swaps, for staff. */
    swaps: `${ADMIN_BASE}/swaps`,
    /** `POST` to cancel a live swap, settling one stuck while being carried out. */
    cancelSwap: (swapId: string) => `${ADMIN_BASE}/swaps/${enc(swapId)}/cancel`,
    /** `GET` an operation's teams with their kind's ladder. */
    teams: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/teams`,
    /** `GET` (`?operationId`) the broadcasts of an operation, `POST` `{ operationId, audience, channels, subject, message }` to send one (`shifts:broadcast`). */
    broadcasts: `${ADMIN_BASE}/broadcasts`,
    /** `GET` / `POST` an operation's perks (meal and drink vouchers). */
    perks: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/perks`,
    /** `PATCH` / `DELETE` one perk. */
    perk: (perkId: string) => `${ADMIN_BASE}/perks/${enc(perkId)}`,
  },
} as const
