import type { AddressInfo, Server } from 'node:net'
import net from 'node:net'
import { defineNitroPlugin, useStorage } from 'nitropack/runtime'
import { sqlite } from '#desktop/local-db'
import { applyMigrations, selectMigrations } from '../../shared/local-db'

// Local mode: applies the bundled migrations before the first request, then prints `READY <port>` on stdout, the line
// the Tauri shell waits for before it opens the window on the server.

const MIGRATIONS = 'assets:desktop-migrations'

async function migrate(): Promise<void> {
  if (!sqlite) return
  const started = Date.now()
  const storage = useStorage(MIGRATIONS)
  const files = selectMigrations(await storage.getKeys())
  const migrations = await Promise.all(files.map(async ({ key, name }) => ({ name, sql: String(await storage.getItem(key) ?? '') })))
  const applied = applyMigrations(sqlite(), migrations)
  for (const name of applied) console.log(`[desktop] Applied migration ${name}`)
  console.log(`[desktop] Database ready (${applied.length} of ${migrations.length} migrations applied, ${Date.now() - started} ms)`)
}

interface BunLike { serve: (options: unknown) => { port: number } }

/** Resolves with the port the server listens on: `Bun.serve` under the bun preset, `net.Server#listen` under Node. */
function listeningPort(): Promise<number> {
  return new Promise((resolve) => {
    const bun = (globalThis as { Bun?: BunLike }).Bun
    if (bun) {
      const serve = bun.serve.bind(bun)
      bun.serve = (options: unknown) => {
        const server = serve(options)
        bun.serve = serve
        resolve(server.port)
        return server
      }
      return
    }
    const listen = net.Server.prototype.listen
    net.Server.prototype.listen = function (this: Server, ...args: unknown[]) {
      net.Server.prototype.listen = listen
      this.once('listening', () => resolve((this.address() as AddressInfo).port))
      return (listen as (...a: unknown[]) => Server).apply(this, args)
    } as typeof listen
  })
}

export default defineNitroPlugin((nitroApp) => {
  const port = listeningPort()
  const migrated = migrate().catch((error: unknown) => {
    console.error(`[desktop] ${(error as Error).message}`)
    process.exit(1)
  })
  // Nitro listens before the plugins' promises settle: hold every request until the database is ready.
  nitroApp.hooks.hook('request', () => migrated)
  void Promise.all([migrated, port]).then(([, value]) => {
    process.stdout.write(`READY ${value}\n`)
  })
})
