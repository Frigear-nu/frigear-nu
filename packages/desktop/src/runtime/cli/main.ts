import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { DesktopManifest } from '../../types'
import { CAPABILITY_FILE, FALLBACK_APP_ID, mergeTauriConfig, toJson, type JsonObject } from '../shared/config'
import { CARGO_TOML, runDoctor, TAURI_CONFIG, type DoctorFinding } from './doctor'
import { pngIco, solidPng } from './icon'
import { baseTauriConfig, BUILD_RS, cargoToml, GITIGNORE, libRs, mainRs } from './templates'

export interface CliArgs {
  command: 'init' | 'sync' | 'dev' | 'build' | 'doctor' | 'help'
  cwd: string
  force: boolean
  /** Everything after `--`, passed on to `tauri dev` / `tauri build`. */
  passthrough: string[]
}

const COMMANDS = ['init', 'sync', 'dev', 'build', 'doctor'] as const

const USAGE = `Usage: frigear-desktop <command> [options] [-- <tauri options>]

Commands:
  init      Create src-tauri/ (Cargo project, plugins, placeholder icons), then sync. Existing files are kept.
  sync      Merge the app's desktop settings into src-tauri/tauri.conf.json and src-tauri/capabilities/frigear.json.
  dev       sync, then \`tauri dev\` (starts \`nuxt dev\` and opens the window on it).
  build     sync, then \`tauri build\` (runs \`nuxt generate\` first and bundles the app).
  doctor    Check Rust, @tauri-apps/cli, the OS prerequisites, src-tauri/ and the app's Tauri packages.

Options:
  --cwd <dir>   The app's directory. Default: the current directory.
  --force       init: overwrite the files it creates.
`

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { command: 'help', cwd: process.cwd(), force: false, passthrough: [] }
  const rest = [...argv]
  const separator = rest.indexOf('--')
  if (separator !== -1) args.passthrough = rest.splice(separator).slice(1)
  const command = rest.shift()
  if ((COMMANDS as readonly string[]).includes(command ?? '')) args.command = command as CliArgs['command']
  else if (command && command !== 'help' && command !== '--help' && command !== '-h') throw new Error(`Unknown command "${command}".\n\n${USAGE}`)
  if (args.passthrough.length && args.command !== 'dev' && args.command !== 'build') throw new Error('Options after `--` are only for `dev` and `build`.')
  while (rest.length) {
    const arg = rest.shift()!
    // Split at the first `=` only: `--cwd=/apps/a=b` keeps the whole path.
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const flag = eq === -1 ? arg : arg.slice(0, eq)
    const inline = eq === -1 ? undefined : arg.slice(eq + 1)
    if (flag === '--cwd') {
      const value = inline ?? (rest[0]?.startsWith('--') ? undefined : rest.shift())
      if (!value) throw new Error(`--cwd needs a value.\n\n${USAGE}`)
      args.cwd = resolve(value)
    }
    else if (flag === '--force') {
      if (inline !== undefined) throw new Error('--force takes no value.')
      if (args.command !== 'init') throw new Error('--force is only for `init`.')
      args.force = true
    }
    else throw new Error(`Unknown option "${arg}".\n\n${USAGE}`)
  }
  return args
}

export interface Io {
  log: (message: string) => void
  error: (message: string) => void
  /** Runs a command in the app's directory with the terminal attached; throws when it fails. */
  exec: (command: string, args: string[], cwd: string) => void
  /** Runs a command quietly: whether it succeeded and its output. */
  probe: (command: string, args: string[]) => { ok: boolean, stdout: string }
  platform: NodeJS.Platform
}

const shell = process.platform === 'win32'

export const defaultIo: Io = {
  log: message => console.log(message),
  error: message => console.error(message),
  exec: (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit', shell }),
  probe: (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', shell })
    return { ok: !result.error && result.status === 0, stdout: result.stdout ?? '' }
  },
  platform: process.platform,
}

const readJson = <T>(file: string): T | null => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : null)

/**
 * Whether `pkg` is installed for the app: in its `node_modules` or a parent's (a workspace root), where `npx` finds
 * its binary. Not through `require.resolve`, which also follows `NODE_PATH`.
 */
export function isResolvable(pkg: string, cwd: string): boolean {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', pkg, 'package.json'))) return true
    if (dirname(dir) === dir) return false
  }
}

export interface Generated {
  config: JsonObject
  capabilities: JsonObject
  manifest: DesktopManifest
}

const nuxtDirs = (cwd: string) => [join(cwd, '.nuxt/desktop'), join(cwd, 'node_modules/.cache/nuxt/.nuxt/desktop')]

function readGenerated(cwd: string): Generated | null {
  const dir = nuxtDirs(cwd).find(candidate => existsSync(join(candidate, 'manifest.json')))
  if (!dir) return null
  return {
    config: readJson<JsonObject>(join(dir, 'tauri.json')) ?? {},
    capabilities: readJson<JsonObject>(join(dir, 'capabilities.json')) ?? {},
    manifest: readJson<DesktopManifest>(join(dir, 'manifest.json'))!,
  }
}

/** The files the module writes to `.nuxt/desktop/`, after a fresh `nuxt prepare` (the settings may have changed). */
function loadGenerated(cwd: string, io: Io): Generated {
  io.log('Running `nuxt prepare` to resolve the app\'s desktop settings…')
  io.exec('npx', ['nuxt', 'prepare'], cwd)
  const generated = readGenerated(cwd)
  if (!generated) throw new Error('No .nuxt/desktop/manifest.json: is `@frigear-nu/desktop` in the app\'s nuxt.config modules?')
  if (generated.manifest.appId === FALLBACK_APP_ID) throw new Error('`desktop.appId` is not set in nuxt.config: set your app\'s reverse-DNS id.')
  return generated
}

/** Writes `contents` unless the file already has them. Returns whether it wrote. */
function writeIfChanged(file: string, contents: string | Buffer): boolean {
  if (existsSync(file)) {
    const current = readFileSync(file)
    if (current.equals(Buffer.isBuffer(contents) ? contents : Buffer.from(contents))) return false
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents)
  return true
}

/**
 * Merges the generated config into `src-tauri/tauri.conf.json` (keys the module does not own are kept) and writes the
 * capability file it owns. Changes nothing when both are up to date.
 */
export function syncProject(cwd: string, generated: Pick<Generated, 'config' | 'capabilities'>, io: Pick<Io, 'log'>): string[] {
  const configFile = join(cwd, TAURI_CONFIG)
  const existing = readJson<JsonObject>(configFile)
  if (!existing) throw new Error(`${TAURI_CONFIG} does not exist: run \`frigear-desktop init\` first.`)
  const changed: string[] = []
  if (writeIfChanged(configFile, toJson(mergeTauriConfig(existing, generated.config)))) changed.push(TAURI_CONFIG)
  if (writeIfChanged(join(cwd, 'src-tauri', CAPABILITY_FILE), toJson(generated.capabilities))) changed.push(`src-tauri/${CAPABILITY_FILE}`)
  io.log(changed.length ? `✔ Updated ${changed.join(' and ')}.` : '✔ src-tauri/ is up to date.')
  return changed
}

/** The files of a new `src-tauri/`, relative to the app's root. */
export function initFiles(manifest: DesktopManifest): Record<string, string | Buffer> {
  const png = solidPng(256)
  return {
    [CARGO_TOML]: cargoToml(manifest),
    'src-tauri/build.rs': BUILD_RS,
    'src-tauri/src/main.rs': mainRs(manifest),
    'src-tauri/src/lib.rs': libRs(manifest),
    'src-tauri/.gitignore': GITIGNORE,
    [TAURI_CONFIG]: toJson(baseTauriConfig(manifest)),
    'src-tauri/icons/icon.png': png,
    'src-tauri/icons/icon.ico': pngIco(png, 256),
  }
}

/** `frigear-desktop init`: the files that do not exist yet (all of them with `force`), then `sync`. */
export function init(cwd: string, generated: Generated, force: boolean, io: Pick<Io, 'log'>): void {
  for (const [path, contents] of Object.entries(initFiles(generated.manifest))) {
    const file = join(cwd, path)
    if (existsSync(file) && !force) {
      io.log(`✔ ${path} exists; kept.`)
      continue
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, contents)
    io.log(`✔ Created ${path}.`)
  }
  syncProject(cwd, generated, io)
  io.log('Replace the placeholder icons with `npx tauri icon path/to/logo.png` (a square PNG, 1024px).')
}

export function doctor(cwd: string, io: Io): DoctorFinding[] {
  return runDoctor({
    platform: io.platform,
    exec: io.probe,
    isInstalled: pkg => isResolvable(pkg, cwd),
    readFile: path => (existsSync(join(cwd, path)) ? readFileSync(join(cwd, path), 'utf8') : null),
    manifest: readGenerated(cwd)?.manifest ?? null,
  })
}

function printFindings(findings: DoctorFinding[], io: Io) {
  if (!findings.length) {
    io.log('✔ Ready to build the desktop app.')
    return
  }
  for (const finding of findings) {
    const line = `${finding.level === 'error' ? '✖' : finding.level === 'warning' ? '⚠' : 'ℹ'} ${finding.message}`
    if (finding.level === 'info') io.log(line)
    else io.error(line)
  }
}

export async function main(argv: string[] = process.argv.slice(2), io: Io = defaultIo): Promise<number> {
  try {
    const args = parseArgs(argv)
    const { cwd } = args
    switch (args.command) {
      case 'help':
        io.log(USAGE)
        return 0
      case 'doctor': {
        const findings = doctor(cwd, io)
        printFindings(findings, io)
        return findings.some(finding => finding.level === 'error') ? 1 : 0
      }
      case 'init':
        init(cwd, loadGenerated(cwd, io), args.force, io)
        return 0
      case 'sync':
        syncProject(cwd, loadGenerated(cwd, io), io)
        return 0
      case 'dev':
      case 'build': {
        if (!isResolvable('@tauri-apps/cli', cwd)) throw new Error('`@tauri-apps/cli` is not installed in the app: `pnpm add -D @tauri-apps/cli`.')
        syncProject(cwd, loadGenerated(cwd, io), io)
        io.exec('npx', ['tauri', args.command, ...args.passthrough], cwd)
        return 0
      }
    }
  }
  catch (error) {
    io.error(`✖ ${(error as Error).message}`)
    return 1
  }
}
