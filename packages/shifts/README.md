# @frigear-nu/shifts

An operation's shifts: schedules of shifts for its teams, the people on them, swaps between volunteers, a QR pass to
check in and who is on shift now with the lead on duty. Built on [crew](../crew) and [teams](../teams): a person can
hold a shift when they hold an explicit role on its team. Part of the volunteering modules; it follows the contracts of
[`@frigear-nu/audience`](../audience).

- Schedules per operation: `draft` until published, how shifts change hands (`coverage` `all` or `flexible`,
  `handover` `trade`, `release` or `both`, `approval` `peer` or `lead`), people per shift and guards (`maxShiftsPerDay`,
  `minRestHours`).
- Shift roles with a minimum team role; bulk creation of time slots over days in the module's `timeZone`; copying
  another schedule's roles and shifts by a number of days.
- Assignment by staff: an explicit team role that meets the shift role, guard warnings, `409 shift_full` unless forced.
- Swaps: trades (shift for shift, both change hands together; optionally aimed at one shift) and releases (given away,
  taken over), refused where the schedule does not allow them; the guards run for both people; accept (completes at
  once, or waits for a lead's approval), reject and withdraw; conditional writes so two accepts carry out one.
- A check-in code per assignment, shown as a QR pass from `checkInOpensMinutes` before the shift until its end; leads
  scan it or mark attendance.
- Hooks `shifts:schedule:published`, `shifts:shift:created|updated`, `shifts:assignment:changed`,
  `shifts:swap:offered|accepted|rejected|completed` and `shifts:attendance:marked`; listens to `teams:member:removed`
  and `teams:member:role-changed`.
- Permissions `shifts:read`, `shifts:swap`, `shifts:lead` (implicit, with policies), `shifts:manage` and `shifts:pii`;
  the `shifts` scope.
- Pages `/shifts`, `/shifts/:assignmentId`, `/shifts/swaps`, `/shifts/lead/:teamId` and `/shifts/check-in/:teamId`, and a Shifts tab on the
  operation page.

## Quick Setup

Requires `@nuxthub/core`. Crew, Teams, Operations, Notify, Users and Auth are installed for you; `@frigear-nu/admin` and
`@frigear-nu/widget` (the Shifts tab), `@frigear-nu/menu`, `@frigear-nu/mobile` and `@frigear-nu/email-templates` are
optional; `@nuxt/ui` is needed for the pages.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/admin', '@frigear-nu/widget', '@frigear-nu/shifts'],
  operations: { settings: { pages: { admin: true, adminOperation: true } } },
  shifts: { timeZone: 'Europe/Copenhagen' },
})
```

Generate and commit a migration in your app (see the repository `AGENTS.md`): shifts adds the `shift_schedules`,
`shift_roles`, `shifts`, `shift_assignments`, `shift_swaps` and `shift_swap_offers` tables.

Full documentation: <https://docs.frigear.dev/modules/volunteering/shifts>.
