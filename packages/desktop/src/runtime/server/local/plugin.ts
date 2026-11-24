import type { AddressInfo, Server } from 'node:net'
import net from 'node:net'
import { defineNitroPlugin, useStorage } from 'nitropack/runtime'
import { sqlite } from '#desktop/local-db'
import { applyMigrations, selectMigrations } from '../../shared/local-db'
import { CLIENT_IP_HEADER, withClientAddress, type BunServeOptions, type BunServerLike } from '../../shared/client-address'
import { parentWatchEnabled, watchParent } from '../../shared/parent-watch'

// Local mode: applies the bundled migrations before the first request, then prints `READY <port>` on stdout, the line
// the Tauri shell waits for before it opens the window on the server. Started by the shell, it stops when the shell goes
// away (shared/parent-watch).

const MIGRATIONS = 'assets:desktop-migrations'

interface BunLike { serve: (options: BunServeOptions) => BunServerLike }

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

/** Resolves with the port the server listens on: `Bun.serve` under the bun preset, `net.Server#listen` under Node. */
function listeningPort(): Promise<number> {
  return new Promise((resolve) => {
    const bun = (globalThis as { Bun?: BunLike }).Bun
    if (bun) {
      const serve = bun.serve.bind(bun)
      bun.serve = (options: BunServeOptions) => {
        const server = serve(withClientAddress(options))
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

/** Closes Nitro (its `close` hooks, at most 2 s) and the database, then exits. */
async function shutdown(nitroApp: { hooks: { callHook: (name: 'close') => Promise<unknown> } }): Promise<never> {
  await Promise.race([nitroApp.hooks.callHook('close'), new Promise(resolve => setTimeout(resolve, 2000))]).catch(() => {})
  try {
    sqlite?.().close?.()
  }
  catch (error) {
    console.error(`[desktop] Closing the database: ${(error as Error).message}`)
  }
  process.exit(0)
}

export default defineNitroPlugin((nitroApp) => {
  if (parentWatchEnabled(process.env)) {
    watchParent({
      stdin: process.stdin,
      ppid: () => process.ppid,
      platform: process.platform,
      onParentGone: (reason) => {
        console.log(`[desktop] The app quit (${reason === 'stdin' ? 'stdin closed' : 'parent process changed'}): stopping the server.`)
        void shutdown(nitroApp)
      },
    })
  }
  const port = listeningPort()
  const migrated = migrate().catch((error: unknown) => {
    console.error(`[desktop] ${(error as Error).message}`)
    process.exit(1)
  })
  const bun = !!(globalThis as { Bun?: unknown }).Bun
  nitroApp.hooks.hook('request', (event) => {
    // Under Bun the client's address comes from `withClientAddress` (only ever set by this server).
    if (bun) {
      const headers = event.node.req.headers
      const address = headers[CLIENT_IP_HEADER]
      Reflect.deleteProperty(headers, CLIENT_IP_HEADER)
      if (typeof address === 'string' && address && !event.context.clientAddress) event.context.clientAddress = address
    }
    // Nitro listens before the plugins' promises settle: hold every request until the database is ready.
    return migrated
  })
  void Promise.all([migrated, port]).then(([, value]) => {
    process.stdout.write(`READY ${value}\n`)
  })
})
