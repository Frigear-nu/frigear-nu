import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { applySecrets, loadOrCreateSecrets, type SecretName } from '../../shared/local-secrets'

// Local mode: runs first in the bundled server, before Nitro evaluates its runtime config (the module wraps Nitro's
// entry so this module is imported ahead of it). Everything here is synchronous for that reason.

export interface LocalBootstrapOptions {
  /** The port when neither `PORT` nor `NITRO_PORT` is set (`desktop.local.port`). */
  port: number
  /** The secrets to generate on the first start. */
  secrets: SecretName[]
}

/** The server's data folder: `DATA_DIR` (the shell passes the app-data folder), else `.data/desktop` in the cwd. */
export function localDataDir(env: Record<string, string | undefined> = process.env): string {
  return resolve(env.DATA_DIR || join(process.cwd(), '.data', 'desktop'))
}

export function prepareLocalServer(options: LocalBootstrapOptions): void {
  const env = process.env
  const dataDir = localDataDir(env)
  mkdirSync(dataDir, { recursive: true })
  env.DATA_DIR = dataDir
  // Relative paths the app or NuxtHub bake in (`.data/kv` of `hub.kv`, nitro storage) land in the data folder.
  process.chdir(dataDir)

  // Loopback only: cookie sessions over plain http are for this machine, never the network.
  if (env.HOST && env.HOST !== '127.0.0.1') console.warn(`[desktop] Ignoring HOST=${env.HOST}: the local server listens on 127.0.0.1 only.`)
  env.NITRO_HOST = '127.0.0.1'
  env.HOST = '127.0.0.1'
  if (!env.NITRO_PORT && !env.PORT) env.PORT = String(options.port)

  const secrets = loadOrCreateSecrets(join(dataDir, 'secrets.json'), options.secrets)
  applySecrets(env, secrets)
}
