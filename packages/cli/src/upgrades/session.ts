import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { DOCS, nuxtConfigs, type Migration } from '../upgrade/migrate.ts'

const APP_SECRET = [
  '# Seals the session cookie (Nuxt\'s appSecret). Development placeholder: set 32+ random characters in production,',
  '# e.g. `openssl rand -base64 32`.',
  'NUXT_APP_SECRET=dev-only-app-secret-replace-in-production',
]

/**
 * `.env.example` with `NUXT_APP_SECRET`: directly above `NUXT_SESSION_PASSWORD` (and the comment lines that describe
 * it) when the file has one, at the end otherwise.
 */
export const addAppSecret = (text: string) => {
  const lines = text.split('\n')
  let at = lines.findIndex(line => /^\s*(?:export\s+)?NUXT_SESSION_PASSWORD\s*=/.test(line))
  if (at === -1) return `${text.replace(/\n*$/, '\n')}${APP_SECRET.join('\n')}\n`
  while (at > 0 && lines[at - 1]!.trimStart().startsWith('#')) at--
  lines.splice(at, 0, ...APP_SECRET)
  return lines.join('\n')
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
    'Set `NUXT_APP_SECRET` (32+ random characters) in every environment before deploying. Keep `NUXT_SESSION_PASSWORD`: it is still the fallback key for stored OAuth tokens.',
    'The session cookie is renamed (`nuxt-auth-session`): every user is signed out once after the deploy.',
  ],
  async project({ root, files, dryRun }) {
    const applied: string[] = []
    for (const config of nuxtConfigs(files)) {
      const example = join(dirname(config), '.env.example')
      if (!existsSync(example)) continue
      const text = await readFile(example, 'utf-8')
      if (/^\s*NUXT_APP_SECRET\s*=/m.test(text)) continue
      if (!dryRun) await writeFile(example, addAppSecret(text), 'utf-8')
      applied.push(`Added \`NUXT_APP_SECRET\` (a development placeholder) to ${relative(root, example)}`)
    }
    return { applied }
  },
}
