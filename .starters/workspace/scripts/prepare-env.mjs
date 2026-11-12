#!/usr/bin/env node
// `pnpm prepare:env`: creates each app's `.env` from its `.env.example` and fills in the secrets a first run needs.
//
// - Every `apps/*/.env.example` and `packages/*/.env.example` is copied to `.env` next to it, unless that exists.
// - Empty secrets below get a generated value, in a new or an existing `.env`.
// - A value that is already set is never changed, so running it again is safe.
//
// Zero dependencies: Node's own `fs` and `crypto` only.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Generators for secrets that are filled in when their line is empty. */
const secrets = {
  // Nuxt's appSecret: nuxt-auth-utils seals the session cookie with it, at least 32 characters.
  NUXT_APP_SECRET: () => randomBytes(32).toString('base64'),
  // @frigear-nu/oauth-server: a PKCS#8 RSA key, one line with `\n` escapes.
  NUXT_OAUTH_SERVER_PRIVATE_KEY: () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    return `"${privateKey.trim().replaceAll('\n', '\\n')}"`
  },
}

function examples() {
  const found = []
  for (const group of ['apps', 'packages']) {
    const dir = join(root, group)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const example = join(dir, entry.name, '.env.example')
      if (entry.isDirectory() && existsSync(example)) found.push(example)
    }
  }
  return found
}

/** An unset value: nothing after `=`, or empty quotes. */
const isEmpty = value => /^\s*(?:""|'')?\s*$/.test(value)

const list = examples()
if (!list.length) console.log('No .env.example files found.')

for (const example of list) {
  const target = join(dirname(example), '.env')
  const name = relative(root, target)
  const created = !existsSync(target)
  const text = created ? readFileSync(example, 'utf8') : readFileSync(target, 'utf8')

  const filled = []
  const lines = text.split('\n').map((line) => {
    const match = /^(\s*)([A-Z0-9_]+)\s*=(.*)$/.exec(line)
    if (!match) return line
    const [, indent, key, value] = match
    if (!(key in secrets) || !isEmpty(value)) return line
    filled.push(key)
    return `${indent}${key}=${secrets[key]()}`
  })

  if (created || filled.length) writeFileSync(target, lines.join('\n'), { mode: 0o600 })
  const what = [created && 'created from .env.example', filled.length && `generated ${filled.join(', ')}`].filter(Boolean)
  console.log(`${name}: ${what.length ? what.join('; ') : 'up to date, nothing changed'}`)
}
