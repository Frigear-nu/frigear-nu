# @frigear-nu/teams

Teams for the frigear ecosystem: teams owned by an operation or the platform, members with a role from the ladder of
the team's kind (`bar`: volunteer, bartender, BA, coordinator), and role mapping rules that give people a team role
from a global role or a subscription plan without adding them by hand.

- Explicit memberships are rows; mapped ones are resolved at read time and never stored. An explicit membership always
  wins over a mapped role on the same team.
- `resolveTeamRoles(event, userId, owner)` and `isTeamLead(event, userId, teamId)` for other modules (auto-imported).
- Answers `audience:viewer:resolve` and `audience:owner:resolve` (`team`) of `@frigear-nu/audience`.
- Permissions `teams:read`, `teams:lead`, `teams:manage` and `teams:pii`; the `teams` scope and OAuth claim.
- Admin pages at `/admin/teams` (opt-in) and a "Teams" tab on the operation page.

Documentation: https://docs.frigear.dev/modules/volunteering/teams
