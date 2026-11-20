import { relative } from 'node:path'
import { DOCS, items, option, readNuxtConfigs, type Migration } from '../upgrade/migrate.ts'

const GUIDE = `${DOCS}/guide/going-further/migrate-access-control`

/** auth 0.5.0: one permission model; scopes, staff guards and the per-module authorize hooks are gone. */
export const authPermissions: Migration = {
  id: 'auth-permissions',
  package: '@frigear-nu/auth',
  since: '0.5.0',
  title: 'Access checks use permissions: authorize(event, permission, record?)',
  docs: GUIDE,
  schema: true,
  rules: [
    {
      pattern: /\b(?:defineStaffGuard|definePolicyGate|defineStaffScopes|addAuthScope|addAuthRole|principalHasScopes|isGrantableScope|isPiiScope|ALL_SCOPES)\b/g,
      message: 'Removed in auth 0.5. Register permissions with `defineAccess` + `registerAccess` (or `addPermission`), and check them with `await authorize(event, \'resource:action\', record?)`.',
    },
    {
      pattern: /#auth\/scopes\b/g,
      message: '`#auth/scopes` is gone: permissions are registered with `defineAccess` / `addPermission`.',
    },
    {
      pattern: /\b(?:requireUser|requireAuth|getUser)\(\s*[\w.]+\s*,\s*\{[^}]*\bscopes\b/g,
      message: 'The `scopes` option is gone: `requireUser` / `requireAuth` only authenticate. Check access with `await authorize(event, \'resource:action\')`.',
    },
    {
      pattern: /\bhasScopes?\(/g,
      message: '`hasScope(s)` is gone: use `await allows(event, permission)` on the server, `ctx.can(permission)` in MCP, `can(permission)` in the client.',
    },
    {
      pattern: /\brequireUserSession\(/g,
      message: 'Do not use nuxt-auth-utils\' `requireUserSession`: it ignores API and OAuth tokens. Use `authorize(event, permission)`, or `requireAuth(event)` for a route any signed-in user may call.',
    },
    {
      pattern: /['"](?!users:admin:)[\w-]+:authorize['"]/g,
      message: 'A `<module>:authorize` hook is the old pattern: register the module\'s permissions (`defineAccess` + `registerAccess`), check them with `authorize(event, permission, record)`, and move host rules to a policy (`definePolicy`) or `authorization:before`.',
    },
    {
      pattern: /['"](?:auth:user-permissions|auth:scope-available|oauth:scope:staff|oauth:user:roles)['"]/g,
      message: 'This hook never fires since auth 0.5: move it to `authorization:roles` (roles) or `authorization:before` (overrides).',
    },
  ],
  steps: [
    'Mint API tokens again: a token issued before the upgrade has no frozen permissions and holds nothing.',
    'Everything fails closed: an unregistered permission is a 403 (also for admins), and `*` never covers sensitive (`:pii`) permissions. Click through the staff areas before deploying.',
  ],
  async project({ root, files }) {
    const manual: string[] = []
    for (const { file, options } of await readNuxtConfigs(files)) {
      const at = relative(root, file)
      if (option(options, 'authentication.scopes') !== undefined) {
        manual.push(`${at}: \`authentication.scopes\` is ignored since auth 0.5. Rename it to \`authentication.permissions\` and give each entry \`{ name, label, grantTo }\`.`)
      }
      const rules = option(options, 'routeRules')
      if (rules && typeof rules === 'object') {
        for (const [path, rule] of Object.entries(rules)) {
          const old = ['roles', 'ability', 'scopes'].filter(key => option(rule, key) !== undefined)
          if (old.length) manual.push(`${at}: route rule \`${path}\` uses \`${old.join('`, `')}\`, which fail the build: use \`permission: 'resource:action'\`.`)
        }
      }
    }
    return { manual }
  },
}

/** authorization 0.5.0: abilities, bouncer and the RBAC options are replaced by roles that grant permissions. */
export const authorizationRoles: Migration = {
  id: 'authorization-roles',
  package: '@frigear-nu/authorization',
  since: '0.5.0',
  title: 'Abilities and RBAC options are replaced by roles and policies',
  docs: GUIDE,
  schema: true,
  rules: [
    {
      pattern: /\b(?:defineAbility|bouncer|resolveAuthorizationUser)\b/g,
      message: 'Removed in authorization 0.5: an ability becomes a permission granted to roles, plus a `definePolicy` for rules about the record.',
    },
    {
      pattern: /\bauthorize\(\s*[\w.]+\s*,\s*(?![\w.]*(?:[Aa]ccess|permissions)\b)[A-Za-z_$][\w$]*\s*[,)]/g,
      message: 'Check this call: `authorize(event, permission, record?)` takes a permission name now, not an ability.',
    },
    {
      pattern: /<(?:Can|Cannot)\b[^>]*\s:?(?:ability|role)=/g,
      message: '`<Can ability>` / `<Can role>` are gone: use `<Can permission="resource:action" :record="record">`.',
    },
    {
      pattern: /\bauthorize\s*:\s*\{[^}]*\b(?:roles|ability)\b/g,
      message: '`definePageMeta({ authorize: { roles | ability } })` is gone: use `authorize: \'resource:action\'`.',
    },
    {
      pattern: /['"]authorization:(?:role|authorize)['"]/g,
      message: 'This hook is gone: use `authorization:roles` (push to `ctx.roles`) or `authorization:before` (`allow()` / `deny()`).',
    },
    {
      pattern: /\buseAuthorization\(\)/g,
      when: /\bcan\(\s*(?!['"`])/,
      message: 'Check the `can(...)` calls in this file: `can(permission, record?)` takes a permission name now, not an ability.',
    },
    {
      pattern: /\b(?:effectiveRole|userHasRole|hasRole)\b/g,
      message: 'A role check of its own: access comes from roles that grant permissions now. Check the permission (`authorize` / `allows` on the server, `can()` in the client), and move an env allowlist to an `authorization:roles` hook that pushes the role (it is never stored).',
    },
    {
      pattern: /\b(?:NUXT_ACL_ADMINS|NUXT_ADMIN_EMAILS|aclAdmins|adminEmails)\b/g,
      unless: /authorization:roles/,
      message: 'An admin allowlist: give those users the role in an `authorization:roles` hook (`ctx.roles.push(\'admin\')`, from `ctx.user`, verified addresses only) instead of a role on the session or the user row.',
    },
    {
      pattern: /\b\w*[uU]sers?\??\.role\b/g,
      message: '`users.role` is copied once into `authorization_user_roles` and never read again: a read sees a stale value, a write is silently ignored (new users get no role). Read access with `can()` / `allows`, and assign roles with `setAuthUserRoles` (or the users admin).',
    },
    {
      pattern: /\brole\s*:\s*['"`][\w-]+['"`]/g,
      when: /\binsert\(\s*users\b|\b(?:createUser|findOrCreateUser|defineTask)\b/,
      message: 'Writes `users.role`, which is no longer read: assign the role with `setAuthUserRoles(userId, roles, { source: \'manual\' })` instead.',
    },
    {
      pattern: /\brequireAuth\(\s*[\w.]+\s*,\s*\{[^}]*\bsessionOnly\b/g,
      when: /\.role\b|effectiveRole|isAdmin/,
      message: 'A session-only route with a role check: register a `sessionOnly` permission granted to that role and check it with `authorize(event, permission)`.',
    },
  ],
  steps: [
    'Run the verification SQL of the migration guide: `users.role` is copied once into `authorization_user_roles` and no longer read.',
    'Roles add up: a user holds their assigned roles plus every `defaultRoles` role. Where a stored role used to replace the default (a `tenant` who is not a `user`), drop the default in an `authorization:roles` hook, or leave it out of `defaultRoles`.',
  ],
  async project({ root, files }) {
    const manual: string[] = []
    for (const { file, options } of await readNuxtConfigs(files)) {
      const at = relative(root, file)
      if (option(options, 'authentication.settings.session.mapper') !== undefined) {
        manual.push(`${at}: \`authentication.settings.session.mapper\` is set. If it puts \`role\` on the session user, remove that (or the mapper): access no longer reads it, and a stale role on the session only misleads the client.`)
      }
      const removed = ['abilities', 'resolvers', 'rbac'].filter(key => option(options, `authorization.${key}`) !== undefined)
      const roleKeys = ['hierarchy', 'inherits', 'grant', 'revoke', 'labels', 'descriptions', 'definitions', 'defaultRole']
        .filter(key => option(options, `authorization.roles.${key}`) !== undefined)
      if (removed.length || roleKeys.length) {
        const names = [...removed.map(key => `authorization.${key}`), ...roleKeys.map(key => `authorization.roles.${key}`)]
        manual.push(`${at}: \`${names.join('`, `')}\` are gone. Declare each role as \`authorization.roles.<name>: { grant, inherit, label }\` and set \`authorization.defaultRoles\`.`)
      }
    }
    return { manual }
  },
}

/** users 3.0.0: the users admin is driven by `users:*` permissions; its hooks, roles route and helpers are gone. */
export const usersPermissions: Migration = {
  id: 'users-permissions',
  package: '@frigear-nu/users',
  since: '3.0.0',
  title: 'The users admin checks users:* permissions',
  docs: GUIDE,
  rules: [
    {
      pattern: /['"]users:admin:(?:authorize|roles)['"]/g,
      message: 'This hook is gone: use `authorization:before` or a policy on `users:*`; roles come from `authorization.roles`.',
    },
    {
      pattern: /\b(?:isUsersAdminAllowed|assignableRoles|usersHaveRoles|USERS_READ_SCOPE)\b/g,
      message: 'Removed in users 3.0: check `users:*` permissions with `authorize` / `allows`.',
    },
    {
      pattern: /\/api\/admin\/users\/roles\b/g,
      message: '`GET /api/admin/users/roles` is gone: roles come from `authorization.roles`, and `GET /api/auth/me/access` lists the caller\'s.',
    },
  ],
  steps: [
    'Listing users needs `users:list` now (`users:read` opens one user): grant both to the roles that had `users:read`.',
  ],
}

/** admin 0.4.0 / account 0.5.0: `roles` options became `permission` and throw at build time. */
export const adminPermission: Migration = {
  id: 'admin-permission',
  package: '@frigear-nu/admin',
  since: '0.4.0',
  title: 'admin.settings.roles is admin.settings.permission',
  docs: GUIDE,
  async project({ root, files }) {
    const manual: string[] = []
    for (const { file, options } of await readNuxtConfigs(files)) {
      if (option(options, 'admin.settings.roles') !== undefined) {
        manual.push(`${relative(root, file)}: \`admin.settings.roles\` throws at build time. Remove it and grant \`admin:access\` (the default \`admin.settings.permission\`) to those roles in \`authorization.roles\`.`)
      }
    }
    return { manual }
  },
}

export const accountPermission: Migration = {
  id: 'account-permission',
  package: '@frigear-nu/account',
  since: '0.5.0',
  title: 'account.settings.documents[].roles is permission',
  docs: GUIDE,
  async project({ root, files }) {
    const manual: string[] = []
    for (const { file, options } of await readNuxtConfigs(files)) {
      const documents = items(option(options, 'account.settings.documents'))
      if (documents.some(document => option(document, 'roles') !== undefined)) {
        manual.push(`${relative(root, file)}: \`account.settings.documents[].roles\` throws at build time: use \`permission: 'resource:action'\`.`)
      }
    }
    return { manual }
  },
}

/** menu 0.3.0: menu items, widgets and tabs filter by permission. */
export const menuPermission: Migration = {
  id: 'menu-permission',
  package: '@frigear-nu/menu',
  since: '0.3.0',
  title: 'Menu items, widgets and tabs filter by permission',
  docs: GUIDE,
  rules: [
    {
      pattern: /\b(?:roles|requires)\s*:/g,
      when: /\b(?:addMenuItems|pushMenuItems|extendTabs|addWidgets?|registerWidgets?)\b/,
      message: 'Menu items, widgets and tabs filter by `permission: \'resource:action\'` now: replace role names with the permission the target route checks.',
    },
  ],
}

/** mcp 0.4.0: every definition declares one permission. */
export const mcpPermission: Migration = {
  id: 'mcp-permission',
  package: '@frigear-nu/mcp',
  since: '0.4.0',
  title: 'MCP definitions take { permission }',
  docs: GUIDE,
  rules: [
    {
      pattern: /\b(?:scopes|gate|sessionOnly)\s*:/g,
      when: /\bdefineScopedMcp(?:Tool|Resource|Prompt)\b/,
      message: '`defineScopedMcp*` take only `{ permission: \'resource:action\' }` now; a definition without one throws. Use a `sessionOnly` permission for money and credentials.',
    },
    {
      pattern: /\bctx\.hasScopes?\(/g,
      message: '`ctx.hasScope(s)` is `await ctx.can(permission)`.',
    },
    {
      pattern: /\bScopedGate\b/g,
      message: '`ScopedGate` is gone: definitions declare a `permission`.',
    },
  ],
}
