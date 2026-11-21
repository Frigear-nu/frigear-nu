# @frigear-nu/crew

An operation's crew: who applied, who is approved, and which team and role they hold. A volunteer applies through a
[forms](../forms) form chosen per operation, staff approve, reject or waitlist, and an invite link puts a lead on a team
directly. Crew is built on [teams](../teams): an approved person holds a team role of one of the operation's teams.
Part of the volunteering modules: crew answers who takes part in an operation, which the `operation` grant kind of
[`@frigear-nu/operations`](../operations) and its `operations:read` policy use.

- Crew memberships are `team_members` rows with a `crewStatus` (`applied`, `waitlisted`, `approved`, `rejected`,
  `withdrawn`). Teams' own `status` follows it (`pending`, `active`, `inactive`), so only an approved person holds the role.
- Applications are submissions of the operation's form (`forms:submitted`); the form must ask for a signed-in user.
- Capacity with a waiting list that moves up when a place frees, and "earlier crew first".
- Invite links with hashed tokens, a number of uses claimed atomically, an optional expiry and an optional lead role.
- Role presets from the `rolePresets` option (global roles or plans to team roles, none by default) and status emails
  through notify.
- Hooks `crew:member:applied|approved|rejected|waitlisted|withdrawn`; answers `operations:participation:resolve` and
  `operations:participants:resolve` with the people who take part in an operation (approved crew, and members added by
  hand).
- Permissions `crew:apply`, `crew:read`, `crew:manage`, `crew:pii` and `crew:invite` (session only); the `crew` scope.
- Pages `/crew/apply/:operationSlug`, `/crew/status` and `/crew/invite/:token`, and a Crew tab on the operation page.

## Quick Setup

Requires `@nuxthub/core`. Operations, Teams, Forms, Notify, Users and Auth are installed for you; `@frigear-nu/admin` and
`@frigear-nu/widget` (the Crew tab), `@frigear-nu/menu`, `@frigear-nu/mobile` and `@frigear-nu/email-templates` are
optional; `@nuxt/ui` is needed for the pages.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/admin', '@frigear-nu/widget', '@frigear-nu/crew'],
  operations: { settings: { pages: { admin: true, adminOperation: true } } },
  teams: { settings: { pages: { admin: true, adminTeam: true } } },
})
```

Generate and commit a migration in your app (see the repository `AGENTS.md`): crew adds the `crew_settings` and
`crew_invites` tables, columns to `team_members` and a `phone` column to `users`.

Full documentation: <https://docs.frigear.dev/modules/volunteering/crew>.
