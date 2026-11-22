# @frigear-nu/teams

Teams for the frigear ecosystem: teams owned by an operation or the platform, members with a role from the ladder of
the team's kind, and role mapping rules that give people a team role from a global role or a subscription plan
without adding them by hand. The app defines its kinds and ladders in the `ladders` option; the module ships one
generic `default` ladder (`member`, `lead`). The option only seeds: a kind is stored once, and later changes to it in
`nuxt.config` are ignored; edit a stored ladder in the admin.

- Explicit memberships are rows; mapped ones are resolved at read time and never stored. An explicit membership always
  wins over a mapped role on the same team.
- `resolveTeamRoles(event, userId, owner)` and `isTeamLead(event, userId, teamId)` for other modules (auto-imported).
- Registers the `team` grant kind of `@frigear-nu/auth` (a minimum role on one team), and owns owner references
  (`ownerType` / `ownerId`, `OwnerRef`) and the `teams:owner:resolve` hook.
- Permissions `teams:read`, `teams:lead`, `teams:manage` and `teams:pii`; the `teams` scope and OAuth claim.
- Admin pages at `/admin/teams` (opt-in) and a "Teams" tab on the operation page.

Documentation: https://docs.frigear.dev/modules/organisation/teams
