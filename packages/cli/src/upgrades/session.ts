import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { DOCS, nuxtConfigs, type Migration } from '../upgrade/migrate.ts'

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
      if (!dryRun) await writeFile(example, `${text.replace(/\n*$/, '\n')}NUXT_APP_SECRET=\n`, 'utf-8')
      applied.push(`Added \`NUXT_APP_SECRET=\` to ${relative(root, example)}`)
    }
    return { applied }
  },
}
