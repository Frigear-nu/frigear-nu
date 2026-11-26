import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import type { PackageJson } from 'pkg-types'

/**
 * How a secret is generated: a spec string or a function.
 *
 * - `random:<bytes>`: random bytes, base64 (`random:32` gives 44 characters)
 * - `hex:<bytes>`: random bytes, hex
 * - `uuid`: a random UUID
 * - `rsa`: a 2048-bit PKCS#8 RSA private key on one line with `\n` escapes, in double quotes
 */
export type SecretGenerator = string | (() => string)

/** The secrets filled in when their line is empty, unless a project turns them off. */
export const BUILTIN_SECRETS: Record<string, SecretGenerator> = {
  // Nuxt's appSecret: nuxt-auth-utils seals the session cookie with it, at least 32 characters.
  NUXT_APP_SECRET: 'random:32',
  // @frigear-nu/oauth-server signs its tokens with it.
  NUXT_OAUTH_SERVER_PRIVATE_KEY: 'rsa',
}

/** The folders whose direct subfolders are searched for `.env.example`. */
export const DEFAULT_ENV_DIRS = ['apps', 'packages']

const rsaKey = () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return `"${privateKey.trim().replaceAll('\n', '\\n')}"`
}

const byteCount = (key: string, spec: string, value: string | undefined) => {
  const bytes = Number(value)
  if (!Number.isInteger(bytes) || bytes < 1)
    throw new Error(`${key}: "${spec}" needs a positive number of bytes, e.g. "${spec.split(':')[0]}:32"`)
  return bytes
}

/** A new value for `key` from its generator. Throws for an unknown spec. */
export const generateSecret = (key: string, generator: SecretGenerator): string => {
  if (typeof generator === 'function') return generator()
  const [kind, value] = generator.split(':', 2)
  switch (kind) {
    case 'random': return randomBytes(byteCount(key, generator, value)).toString('base64')
    case 'hex': return randomBytes(byteCount(key, generator, value)).toString('hex')
    case 'uuid': return randomUUID()
    case 'rsa': return rsaKey()
    default: throw new Error(`${key}: unknown secret generator "${generator}" (use random:<bytes>, hex:<bytes>, uuid or rsa)`)
  }
}

export interface EnvConfig {
  /** The secrets to fill in, built-ins included; a project's `false` has removed a built-in. */
  secrets: Record<string, SecretGenerator>
  dirs: string[]
}

/** `overrides` over `base`; a `false` removes the key. */
const mergeSecrets = (base: Record<string, SecretGenerator>, overrides: Record<string, SecretGenerator | false> = {}) =>
  Object.fromEntries(Object.entries({ ...base, ...overrides })
    .filter((entry): entry is [string, SecretGenerator] => entry[1] !== false))

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/**
 * The secrets and folders of a workspace: the built-ins, then `frigear.env` of its root package.json
 * (`secrets`: key → spec, or `false` to drop a built-in; `dirs`: the folders to search).
 */
export const resolveEnvConfig = (rootPkg?: PackageJson): EnvConfig => {
  const env = record(record(rootPkg?.frigear).env)
  const own = record(env.secrets)
  for (const [key, value] of Object.entries(own)) {
    if (value !== false && typeof value !== 'string')
      throw new Error(`frigear.env.secrets.${key} in package.json must be a generator spec or false`)
  }
  const secrets = mergeSecrets(BUILTIN_SECRETS, own as Record<string, SecretGenerator | false>)
  const dirs = Array.isArray(env.dirs) ? env.dirs.filter(dir => typeof dir === 'string') as string[] : DEFAULT_ENV_DIRS
  return { secrets, dirs }
}

export interface PrepareEnvOptions {
  /** The workspace root. */
  root: string
  /** Its root package.json; read from `root` when left out. Its `frigear.env` is applied before `secrets`. */
  rootPkg?: PackageJson
  /** More secrets, or other generators for existing ones (functions allowed), applied last. */
  secrets?: Record<string, SecretGenerator | false>
  /** The folders whose direct subfolders are searched; default `frigear.env.dirs`, else `apps` and `packages`. */
  dirs?: string[]
  /** Report what would change without writing anything. */
  dryRun?: boolean
}

export interface PrepareEnvResult {
  /** The `.env` file, relative to the root. */
  file: string
  /** Whether it was (or would be) created from `.env.example`. */
  created: boolean
  /** The keys that got a generated value. */
  generated: string[]
}

/** An unset value: nothing after `=`, or empty quotes. */
const isEmpty = (value: string) => ['', '""', '\'\''].includes(value.trim())

/** Every `<dir>/*\/.env.example` under the root. */
const findExamples = async (root: string, dirs: string[]) => {
  const found: string[] = []
  for (const group of dirs) {
    const dir = join(root, group)
    if (!existsSync(dir)) continue
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const example = join(dir, entry.name, '.env.example')
      if (entry.isDirectory() && existsSync(example)) found.push(example)
    }
  }
  return found
}

/**
 * Creates each app's and package's `.env` from its `.env.example` (when it has none) and fills in empty secrets, in new
 * and existing files. A value that is set is never changed, so running it again is safe.
 */
export const prepareEnv = async (options: PrepareEnvOptions): Promise<PrepareEnvResult[]> => {
  const { root } = options
  const rootPkg = options.rootPkg ?? (existsSync(join(root, 'package.json')) ? JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as PackageJson : undefined)
  const config = resolveEnvConfig(rootPkg)
  const secrets = mergeSecrets(config.secrets, options.secrets)

  const results: PrepareEnvResult[] = []
  for (const example of await findExamples(root, options.dirs ?? config.dirs)) {
    const target = join(dirname(example), '.env')
    const created = !existsSync(target)
    const text = await readFile(created ? example : target, 'utf8')

    const generated: string[] = []
    const lines = text.split('\n').map((line) => {
      const match = /^(\s*)([A-Z0-9_]+)\s*=(.*)$/.exec(line)
      if (!match) return line
      const [, indent, key, value] = match as unknown as [string, string, string, string]
      const generator = secrets[key]
      if (generator === undefined || !isEmpty(value)) return line
      generated.push(key)
      return `${indent}${key}=${generateSecret(key, generator)}`
    })

    if (!options.dryRun && (created || generated.length))
      await writeFile(target, lines.join('\n'), { mode: 0o600 })
    results.push({ file: relative(root, target), created, generated })
  }
  return results
}

/** One line per file, as the command prints it. */
export const describeEnvResult = (result: PrepareEnvResult) => {
  const what = [
    result.created && 'created from .env.example',
    result.generated.length && `generated ${result.generated.join(', ')}`,
  ].filter(Boolean)
  return `${result.file}: ${what.length ? what.join('; ') : 'up to date, nothing changed'}`
}
