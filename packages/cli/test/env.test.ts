import { runCommand } from 'citty'
import { createPrivateKey } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSecret, prepareEnv, resolveEnvConfig } from '../src/env/prepare.ts'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'frigear-env-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

const example = async (path: string, text: string) => {
  await mkdir(join(root, path), { recursive: true })
  await writeFile(join(root, path, '.env.example'), text)
}
const env = (path: string) => readFile(join(root, path, '.env'), 'utf8')
const value = (text: string, key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1]

describe('prepareEnv', () => {
  it('creates a missing .env and fills in the built-in secrets', async () => {
    await example('apps/web', 'NUXT_APP_SECRET=\nNUXT_PUBLIC_SITE_URL=http://localhost:3000\n')
    const results = await prepareEnv({ root })
    expect(results).toEqual([{ file: join('apps/web/.env'), created: true, generated: ['NUXT_APP_SECRET'] }])
    const text = await env('apps/web')
    expect(value(text, 'NUXT_APP_SECRET')).toHaveLength(44)
    expect(value(text, 'NUXT_PUBLIC_SITE_URL')).toBe('http://localhost:3000')
    expect((await stat(join(root, 'apps/web/.env'))).mode & 0o777).toBe(0o600)
  })

  it('fills empty values of an existing .env and keeps set ones', async () => {
    await example('apps/web', 'NUXT_APP_SECRET=\n')
    await writeFile(join(root, 'apps/web/.env'), 'NUXT_APP_SECRET=""\nNUXT_OAUTH_SERVER_PRIVATE_KEY=keep-me\n')
    const [result] = await prepareEnv({ root })
    expect(result).toMatchObject({ created: false, generated: ['NUXT_APP_SECRET'] })
    const text = await env('apps/web')
    expect(value(text, 'NUXT_APP_SECRET')).not.toBe('""')
    expect(value(text, 'NUXT_OAUTH_SERVER_PRIVATE_KEY')).toBe('keep-me')
  })

  it('changes nothing on a second run', async () => {
    await example('apps/web', 'NUXT_APP_SECRET=\n')
    await prepareEnv({ root })
    const first = await env('apps/web')
    const [result] = await prepareEnv({ root })
    expect(result).toMatchObject({ created: false, generated: [] })
    expect(await env('apps/web')).toBe(first)
  })

  it('searches packages too, and frigear.env.dirs instead when set', async () => {
    await example('packages/db', 'NUXT_APP_SECRET=\n')
    await example('services/api', 'NUXT_APP_SECRET=\n')
    expect((await prepareEnv({ root, dryRun: true })).map(r => r.file)).toEqual([join('packages/db/.env')])
    const rootPkg = { frigear: { env: { dirs: ['services'] } } }
    expect((await prepareEnv({ root, rootPkg, dryRun: true })).map(r => r.file)).toEqual([join('services/api/.env')])
  })

  it('reads secrets from frigear.env in the root package.json, and false drops a built-in', async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ frigear: { env: { secrets: { MY_TOKEN: 'hex:16', NUXT_APP_SECRET: false } } } }))
    await example('apps/web', 'MY_TOKEN=\nNUXT_APP_SECRET=\n')
    const [result] = await prepareEnv({ root })
    expect(result!.generated).toEqual(['MY_TOKEN'])
    const text = await env('apps/web')
    expect(value(text, 'MY_TOKEN')).toMatch(/^[0-9a-f]{32}$/)
    expect(value(text, 'NUXT_APP_SECRET')).toBe('')
  })

  it('takes generator functions from code', async () => {
    await example('apps/web', 'PIN=\n')
    await prepareEnv({ root, secrets: { PIN: () => '1234' } })
    expect(value(await env('apps/web'), 'PIN')).toBe('1234')
  })

  it('writes nothing in a dry run', async () => {
    await example('apps/web', 'NUXT_APP_SECRET=\n')
    const [result] = await prepareEnv({ root, dryRun: true })
    expect(result).toMatchObject({ created: true, generated: ['NUXT_APP_SECRET'] })
    expect(existsSync(join(root, 'apps/web/.env'))).toBe(false)
  })
})

describe('generateSecret', () => {
  it('generates an RSA key that parses', () => {
    const key = generateSecret('KEY', 'rsa')
    expect(key.startsWith('"-----BEGIN PRIVATE KEY-----\\n')).toBe(true)
    expect(createPrivateKey(JSON.parse(key) as string).asymmetricKeyType).toBe('rsa')
  })

  it('generates a uuid', () => {
    expect(generateSecret('ID', 'uuid')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects an unknown spec or a bad byte count', () => {
    expect(() => generateSecret('KEY', 'nope')).toThrow('KEY: unknown secret generator "nope"')
    expect(() => generateSecret('KEY', 'random:abc')).toThrow('positive number of bytes')
  })

  it('rejects a package.json value that is not a spec or false', () => {
    expect(() => resolveEnvConfig({ frigear: { env: { secrets: { KEY: 1 } } } })).toThrow('frigear.env.secrets.KEY')
  })
})

describe('prepare env command', () => {
  it('runs from a subfolder of the workspace', async () => {
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n')
    await example('apps/web', 'NUXT_APP_SECRET=\n')
    const { mainCmd } = await import('../src/cli.ts')
    const prepare = await (mainCmd.subCommands as Record<string, () => Promise<Parameters<typeof runCommand>[0]>>).prepare!()
    await runCommand(prepare, { rawArgs: ['env', '--cwd', join(root, 'apps/web')] })
    expect(value(await env('apps/web'), 'NUXT_APP_SECRET')).toHaveLength(44)
  })
})
