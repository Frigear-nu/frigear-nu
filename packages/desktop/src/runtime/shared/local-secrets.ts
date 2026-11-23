import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { dirname } from 'node:path'

// Local mode: the secrets of one installation, generated on its first start into the data folder and loaded into the
// environment on every start (before Nitro reads its runtime config). An env var that is already set wins.

/** The secrets the bundled server may need, by env var. */
export const SECRET_GENERATORS = {
  // Nuxt's `appSecret`: nuxt-auth-utils seals the session cookie with it (32+ characters).
  NUXT_APP_SECRET: () => randomBytes(32).toString('base64'),
  // `@frigear-nu/auth`: encrypts kept OAuth tokens (`runtimeConfig.authTokensKey`). Not `NUXT_SESSION_PASSWORD`, its
  // fallback, which nuxt-auth-utils warns about.
  NUXT_AUTH_TOKENS_KEY: () => randomBytes(32).toString('base64'),
  // `@frigear-nu/oauth-server`: signs its tokens (a PKCS#8 RSA key).
  NUXT_OAUTH_SERVER_PRIVATE_KEY: () => generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey,
} satisfies Record<string, () => string>

export type SecretName = keyof typeof SECRET_GENERATORS

/**
 * Reads the secrets file (JSON, mode 0600), adds the missing `names` and writes it back when it changed. Returns every
 * secret in it.
 */
export function loadOrCreateSecrets(file: string, names: SecretName[], generators: Record<string, () => string> = SECRET_GENERATORS): Record<string, string> {
  let secrets: Record<string, string> = {}
  if (existsSync(file)) {
    try {
      secrets = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
    }
    catch (error) {
      throw new Error(`The secrets file ${file} is not valid JSON (${(error as Error).message}). Fix or delete it: deleting it signs every user out.`, { cause: error })
    }
  }
  let changed = false
  for (const name of names) {
    if (typeof secrets[name] === 'string' && secrets[name]) continue
    const generate = generators[name]
    if (!generate) throw new Error(`No generator for the secret ${name}.`)
    secrets[name] = generate()
    changed = true
  }
  if (changed) {
    mkdirSync(dirname(file), { recursive: true })
    // Written whole, then renamed: a crash never leaves half a file that would sign everyone out.
    const temp = `${file}.tmp`
    writeFileSync(temp, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 })
    renameSync(temp, file)
  }
  try {
    chmodSync(file, 0o600)
  }
  catch {
    // Windows: no POSIX modes; the file lives in the user's own app-data folder.
  }
  return secrets
}

/** Sets each secret as an env var unless it is already set (the shell or the user may pass their own). */
export function applySecrets(env: Record<string, string | undefined>, secrets: Record<string, string>): string[] {
  const applied: string[] = []
  for (const [name, value] of Object.entries(secrets)) {
    if (env[name]) continue
    env[name] = value
    applied.push(name)
  }
  return applied
}
