import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { DOCS, items, option, readNuxtConfigs, type Migration } from '../upgrade/migrate.ts'

const GUIDE = `${DOCS}/guide/going-further/migrate-access-control`
const ALLOWLIST = `${GUIDE}#move-an-allowlist-to-authorizationroles`

const ALLOWLIST_FIX = `Move it to an \`authorization:roles\` listener that pushes the role for the listed addresses (see [Move an allowlist to authorization:roles](${ALLOWLIST})), and drop the session mapper that sets \`role\`: the role is not stored, so removing an address removes the access at once.`

/** A `session.mapper` path of `nuxt.config` (`~~/server/…`, `~/…`, `./…`), as the files it may be. */
const mapperCandidates = (rootDir: string, path: string) => {
  const bases = /^(?:~~|@@)\//.test(path)
    ? [join(rootDir, path.slice(3))]
    : /^[~@]\//.test(path)
      ? [join(rootDir, 'app', path.slice(2)), join(rootDir, path.slice(2))]
      : [isAbsolute(path) ? path : join(rootDir, path)]
  return bases.flatMap(base => ['', '.ts', '.mts', '.js', '.mjs'].map(extension => `${base}${extension}`))
}

/**
 * auth 0.5.0: an email allowlist that made users admins (`effectiveRole`, `NUXT_ACL_ADMINS` / `aclAdmins`, a session
 * mapper that sets `role`) no longer grants anything: roles come from `authorization.roles` and `authorization:roles`.
 */
export const roleAllowlist: Migration = {
  id: 'auth-role-allowlist',
  package: '@frigear-nu/auth',
  since: '0.5.0',
  title: 'An admin allowlist becomes an authorization:roles listener',
  docs: ALLOWLIST,
  rules: [
    {
      pattern: /\beffectiveRole\b/g,
      message: `A role computed from an allowlist is never read by access control. ${ALLOWLIST_FIX}`,
    },
    {
      pattern: /\b(?:NUXT_ACL_ADMINS|aclAdmins)\b/g,
      message: `An admin allowlist. ${ALLOWLIST_FIX}`,
    },
  ],
  async project({ root, files }) {
    const manual: string[] = []
    for (const { file, options } of await readNuxtConfigs(files)) {
      const mapper = option(options, 'authentication.settings.session.mapper')
      if (typeof mapper !== 'string') continue
      const path = mapperCandidates(dirname(file), mapper).find(candidate => existsSync(candidate))
      const text = path ? await readFile(path, 'utf-8') : ''
      if (path && !/\brole\s*[:=,}]/.test(text)) continue
      const at = path ? relative(root, path) : `${relative(root, file)} (\`${mapper}\`)`
      manual.push(`${at}: the session mapper (\`authentication.settings.session.mapper\`) ${path ? 'sets' : 'may set'} \`role\`, which access control never reads. ${ALLOWLIST_FIX}`)
    }
    return { manual }
  },
}

const ROLE_COLUMN = 'The `users.role` column is copied once into `authorization_user_roles` on the first request after the upgrade and never read again, so it is stale from then on and later writes to it are silently ignored.'

/** authorization 0.5 / users 3.0: roles live in `authorization_user_roles`; `users.role` is deprecated and dropped next. */
export const roleColumn: Migration = {
  id: 'auth-role-column',
  package: '@frigear-nu/auth',
  since: '0.5.0',
  title: 'users.role is no longer read or written',
  docs: `${GUIDE}#move-the-roles-in-your-data`,
  rules: [
    {
      pattern: /\b(?:userHasRole|hasRole)\b/g,
      message: `${ROLE_COLUMN} A role helper reads it: check a permission instead (\`useAuthorization().can(permission)\`, \`authorize(event, permission)\`), or read \`useAuthorization().access.roles\`.`,
    },
    {
      pattern: /\b\w*[Uu]ser\w*(?:\.value)?\??\.role\b/g,
      message: `${ROLE_COLUMN} Check access with \`useAuthorization().can(permission)\` (or \`access.roles\`) on the client and \`authorize\` / \`allows\` on the server.`,
    },
    {
      pattern: /\.(?:values|set)\(\s*\{[^{}]*?\brole\s*[:,}]/g,
      when: /\busers\b/,
      message: `${ROLE_COLUMN} Assign roles with \`await setAuthUserRoles(userId, roles, { source: 'manual' })\` (auth server util) instead of writing \`role\` on \`users\` (seed tasks too).`,
    },
  ],
}

const quoted = /['"`]([a-z][\w-]*)['"`]/g

/**
 * authorization 0.5: a user's roles add up (assigned ∪ `defaultRoles` ∪ `auto`), so with `defaultRoles: ['user']`
 * every user also holds `user`, where one stored role used to be all they had.
 */
export const additiveRoles: Migration = {
  id: 'auth-additive-roles',
  package: '@frigear-nu/auth',
  since: '0.5.0',
  title: 'Roles add up: the default role is held next to every other role',
  docs: GUIDE,
  async project({ files }) {
    const names = new Set<string>()
    const add = (text: string) => {
      for (const [, name] of text.matchAll(quoted)) names.add(name!)
    }

    let defaults: string[] = ['user']
    for (const { options } of await readNuxtConfigs(files)) {
      const configured = option(options, 'authorization.defaultRoles')
      if (configured !== undefined) defaults = items(configured).filter((name): name is string => typeof name === 'string')
      const roles = option(options, 'authorization.roles')
      if (roles && typeof roles === 'object' && !items(roles).length) for (const name of Object.keys(roles)) names.add(name)
      const rules = option(options, 'routeRules')
      if (rules && typeof rules === 'object') {
        for (const rule of Object.values(rules)) {
          for (const role of items(option(rule, 'roles'))) if (typeof role === 'string') names.add(role)
        }
      }
    }
    for (const file of files) {
      const text = await readFile(file, 'utf-8')
      // role checks: `role === 'tenant'`, `roles: ['admin', 'tenant']`, `['admin', 'tenant'].includes(user.role)`
      for (const match of text.matchAll(/\brole\s*[!=]==?\s*(['"`][a-z][\w-]*['"`])/g)) add(match[1]!)
      for (const match of text.matchAll(/\broles?\s*:\s*\[([^\]]*)\]/g)) add(match[1]!)
      for (const match of text.matchAll(/\[([^\]]*)\]\s*\.includes\(\s*[\w.?]*\brole\)/g)) add(match[1]!)
    }

    const others = [...names].filter(name => !defaults.includes(name)).sort()
    if (!defaults.length || others.length < 2) return {}
    const list = (values: string[]) => values.map(value => `\`${value}\``).join(', ')
    return {
      manual: [
        `Roles add up now: a user holds their stored roles plus \`defaultRoles\` (${list(defaults)}). The app checks several roles (${list(others)}), so a user with one of those stored roles (a portal-only role, say) also holds ${list(defaults)} and everything it grants. Where the old roles were mutually exclusive, remove the default role for those users in an \`authorization:roles\` listener (\`ctx.roles = ctx.roles.filter(role => role !== '${defaults[0]}')\`), or do not make it a default role.`,
      ],
    }
  },
}
