import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { DOCS, option, readNuxtConfigs, type Migration } from '../upgrade/migrate.ts'

/** Modules that install `@frigear-nu/auth` in server mode: an app with one of them has server sessions. */
const SERVER_AUTH = ['@frigear-nu/auth', '@frigear-nu/users', '@frigear-nu/oauth-server']

/** Whether the app of `config` signs users in on its own server (not client-only, and depends on auth). */
const hasServerSessions = async (config: string, options: unknown) => {
  if (option(options, 'ssr') === false || option(options, 'authentication.mode') === 'client') return false
  const manifest = join(dirname(config), 'package.json')
  if (!existsSync(manifest)) return false
  const pkg = JSON.parse(await readFile(manifest, 'utf-8')) as Record<string, Record<string, string> | undefined>
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return SERVER_AUTH.some(name => name in deps)
}

/** `text` with `NUXT_APP_SECRET=` added: right after `NUXT_SESSION_PASSWORD` when it is there, else at the end. */
export const addAppSecret = (text: string) => {
  const entry = '# Seals the session cookie (32+ random characters).\nNUXT_APP_SECRET='
  const session = /^\s*NUXT_SESSION_PASSWORD\s*=.*$/m.exec(text)
  if (!session) return `${text.replace(/\n*$/, '\n')}${entry}\n`
  const end = session.index + session[0].length
  return `${text.slice(0, end)}\n${entry}${text.slice(end)}`
}

/**
 * auth 0.4.0 moved to nuxt-auth-utils 0.6: sessions are sealed with `NUXT_APP_SECRET` (the cookie is renamed, so every
 * user signs in again once) and `users.sessionVersion` is new.
 */
export const authSessionSecret: Migration = {
  id: 'auth-session-secret',
  package: '@frigear-nu/auth',
  since: '0.4.0',
  title: 'Sessions are sealed with NUXT_APP_SECRET',
  docs: `${DOCS}/get-started/upgrading#breaking-changes-by-release`,
  schema: true,
  steps: [
    'Set `NUXT_APP_SECRET` (32+ random characters) in every environment before deploying, and in any script that generates `.env`.',
    '`NUXT_SESSION_PASSWORD` no longer seals sessions. Keep it only where the app stores OAuth or Frigear SSO tokens (it is their key) or reads it itself; otherwise remove it.',
    'The session cookie is renamed (`nuxt-auth-session`): every user is signed out once after the deploy.',
  ],
  async project({ root, files, dryRun }) {
    const applied: string[] = []
    const manual: string[] = []
    for (const { file: config, options } of await readNuxtConfigs(files)) {
      if (option(options, 'runtimeConfig.session.password') !== undefined) {
        manual.push(`${relative(root, config)}: \`runtimeConfig.session.password\` is no longer read (and is a type error): sessions use \`NUXT_APP_SECRET\`. Remove it.`)
      }
      if (!await hasServerSessions(config, options)) continue
      const example = join(dirname(config), '.env.example')
      if (!existsSync(example)) continue
      const text = await readFile(example, 'utf-8')
      if (/^\s*NUXT_APP_SECRET\s*=/m.test(text)) continue
      if (!dryRun) await writeFile(example, addAppSecret(text), 'utf-8')
      applied.push(`Added \`NUXT_APP_SECRET=\` to ${relative(root, example)}`)
    }
    return { applied, manual }
  },
}
