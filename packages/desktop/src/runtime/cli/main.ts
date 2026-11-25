import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { DesktopManifest } from '../../types'
import { BINARIES_DIR, CAPABILITY_FILE, FALLBACK_APP_ID, LOADING_DIR, mergeTauriConfig, toJson, type JsonObject } from '../shared/config'
import { BUN_MISSING, CARGO_TOML, resolveBun, resolveCargo, runDoctor, TAURI_CONFIG, type DoctorFinding } from './doctor'
import { addCommand, BUN_INSTALL, detectPackageManager, planFixes, RUSTUP_INSTALL } from './fix'
import { pngIco, solidPng } from './icon'
import { baseTauriConfig, BUILD_RS, cargoToml, GITIGNORE, libRs, loadingPage, mainRs } from './templates'

export interface CliArgs {
  command: 'init' | 'sync' | 'dev' | 'build' | 'sidecar' | 'doctor' | 'help'
  cwd: string
  force: boolean
  /** `doctor`: install what is missing, then check again. */
  fix: boolean
  /** `sidecar`: the Rust target triple to compile the server for. Default: the host's. */
  target?: string
  /** Everything after `--`, passed on to `tauri dev` / `tauri build`. */
  passthrough: string[]
}

const COMMANDS = ['init', 'sync', 'dev', 'build', 'sidecar', 'doctor'] as const

const USAGE = `Usage: frigear-desktop <command> [options] [-- <tauri options>]

Commands:
  init      Create src-tauri/ (Cargo project, plugins, placeholder icons), then sync. Existing files are kept.
  sync      Merge the app's desktop settings into src-tauri/tauri.conf.json and src-tauri/capabilities/frigear.json.
  dev       sync, then \`tauri dev\` (starts \`nuxt dev\` and opens the window on it).
  build     sync, then \`tauri build\` (runs \`nuxt generate\` first and bundles the app). Local mode: \`nuxt build\`,
            the server compiled with Bun into src-tauri/binaries/, then \`tauri build\`.
  sidecar   Local mode: \`nuxt build\` and the compiled server only, without Tauri.
  doctor    Check Rust, @tauri-apps/cli, the OS prerequisites, src-tauri/ and the app's Tauri packages.
            --fix installs what is missing (Rust with rustup, Bun with bun.sh's installer in local mode, the app's
            packages) and runs init, then checks again.

Options:
  --cwd <dir>        The app's directory. Default: the current directory.
  --force            init: overwrite the files it creates.
  --fix              doctor: install what is missing, then check again.
  --target <triple>  sidecar: the Rust target triple (default: this machine's). For build, pass \`-- --target <triple>\`.
`

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { command: 'help', cwd: process.cwd(), force: false, fix: false, passthrough: [] }
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
    else if (flag === '--target') {
      const value = inline ?? (rest[0]?.startsWith('--') ? undefined : rest.shift())
      if (!value) throw new Error(`--target needs a value.\n\n${USAGE}`)
      if (args.command !== 'sidecar') throw new Error('--target is only for `sidecar`; pass it to `build` after `--`.')
      args.target = value
    }
    else if (flag === '--force') {
      if (inline !== undefined) throw new Error('--force takes no value.')
      if (args.command !== 'init') throw new Error('--force is only for `init`.')
      args.force = true
    }
    else if (flag === '--fix') {
      if (inline !== undefined) throw new Error('--fix takes no value.')
      if (args.command !== 'doctor') throw new Error('--fix is only for `doctor`.')
      args.fix = true
    }
    else throw new Error(`Unknown option "${arg}".\n\n${USAGE}`)
  }
  return args
}

export interface Io {
  log: (message: string) => void
  error: (message: string) => void
  /** Runs a command in the app's directory with the terminal attached; throws when it fails. `env` replaces the environment. */
  exec: (command: string, args: string[], cwd: string, env?: Record<string, string | undefined>) => void
  /** Runs a command quietly: whether it succeeded and its output. */
  probe: (command: string, args: string[]) => { ok: boolean, stdout: string }
  platform: NodeJS.Platform
  /** `process.arch`. Default: this process's. */
  arch?: string
  /** The environment (`BUN`, `CARGO_HOME`, `HOME`, `PATH`). Default: `process.env`. */
  env?: Record<string, string | undefined>
}

const shell = process.platform === 'win32'

export const defaultIo: Io = {
  log: message => console.log(message),
  error: message => console.error(message),
  exec: (command, args, cwd, env) => execFileSync(command, args, { cwd, stdio: 'inherit', shell, ...(env && { env }) }),
  probe: (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', shell })
    return { ok: !result.error && result.status === 0, stdout: result.stdout ?? '' }
  },
  platform: process.platform,
  arch: process.arch,
  env: process.env,
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

/** The environment for `tauri dev` / `tauri build`: rustup's directory on the PATH when the terminal does not have it yet. */
function tauriEnv(io: Io): Record<string, string | undefined> | undefined {
  const env = io.env ?? process.env
  const cargoDir = resolveCargo(env, io.probe, io.platform)
  if (!cargoDir) return undefined
  const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH') ?? 'PATH'
  return { ...env, [key]: [cargoDir, env[key]].filter(Boolean).join(io.platform === 'win32' ? ';' : ':') }
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
 * Keeps the `beforeDevCommand` that `init` wrote (`npx nuxt dev --port <port>`) on the port of `devUrl`, so a changed dev
 * port does not leave the window waiting on one the dev server does not use. A command the app changed is its own.
 */
export function followDevPort(config: JsonObject): JsonObject {
  const build = config.build as JsonObject | undefined
  const command = build?.beforeDevCommand
  const devUrl = build?.devUrl
  if (typeof command !== 'string' || typeof devUrl !== 'string') return config
  const match = /^npx nuxt dev --port (\d+)$/.exec(command)
  let port: string | undefined
  try {
    port = new URL(devUrl).port || undefined
  }
  catch {
    return config
  }
  if (!match || !port || match[1] === port) return config
  return { ...config, build: { ...build, beforeDevCommand: `npx nuxt dev --port ${port}` } }
}

/**
 * Merges the generated config into `src-tauri/tauri.conf.json` (keys the module does not own are kept) and writes the
 * capability file it owns. Changes nothing when both are up to date.
 */
export function syncProject(cwd: string, generated: Pick<Generated, 'config' | 'capabilities'> & Partial<Pick<Generated, 'manifest'>>, io: Pick<Io, 'log'>): string[] {
  const configFile = join(cwd, TAURI_CONFIG)
  const existing = readJson<JsonObject>(configFile)
  if (!existing) throw new Error(`${TAURI_CONFIG} does not exist: run \`frigear-desktop init\` first.`)
  const changed: string[] = []
  if (writeIfChanged(configFile, toJson(followDevPort(mergeTauriConfig(existing, generated.config))))) changed.push(TAURI_CONFIG)
  if (writeIfChanged(join(cwd, 'src-tauri', CAPABILITY_FILE), toJson(generated.capabilities))) changed.push(`src-tauri/${CAPABILITY_FILE}`)
  // Local mode: the loading page the window shows until the server is ready (`build.frontendDist`).
  const manifest = generated.manifest
  if (manifest?.local && writeIfChanged(join(cwd, 'src-tauri', LOADING_DIR, 'index.html'), loadingPage(manifest.appName))) {
    changed.push(`src-tauri/${LOADING_DIR}/index.html`)
  }
  io.log(changed.length ? `✔ Updated ${changed.join(', ')}.` : '✔ src-tauri/ is up to date.')
  return changed
}

/** Rust target triples by `process.platform` and `process.arch`, when `rustc` cannot say. */
const HOST_TRIPLES: Record<string, string> = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
}

/** The Rust target triple of this machine: `rustc -vV`'s `host`, else from the platform and architecture. */
export function hostTriple(io: Pick<Io, 'probe' | 'platform' | 'arch'>): string {
  const rustc = io.probe('rustc', ['-vV'])
  const host = rustc.ok ? /^host:\s*(\S+)/m.exec(rustc.stdout)?.[1] : undefined
  if (host) return host
  const triple = HOST_TRIPLES[`${io.platform}-${io.arch ?? process.arch}`]
  if (!triple) throw new Error(`Cannot tell the Rust target triple of ${io.platform}-${io.arch}: install Rust or pass \`--target\`.`)
  return triple
}

/** Bun's `--target` for a Rust target triple (`aarch64-apple-darwin` → `bun-darwin-arm64`). */
export function bunTarget(triple: string): string {
  const arch = triple.startsWith('x86_64-') ? 'x64' : triple.startsWith('aarch64-') ? 'arm64' : undefined
  const os = triple.includes('-apple-darwin') ? 'darwin' : triple.includes('-windows-') ? 'windows' : triple.includes('-linux-') ? 'linux' : undefined
  if (!arch || !os) throw new Error(`Bun cannot compile the server for ${triple}: supported are x86_64 and aarch64 on macOS, Windows and Linux.`)
  return `bun-${os}-${arch}${os === 'linux' && triple.endsWith('-musl') ? '-musl' : ''}`
}

/** Where the compiled server goes: Tauri's `externalBin` naming, `<name>-<triple>` (`.exe` on Windows). */
export function sidecarPath(binaryName: string, triple: string): string {
  return `src-tauri/${BINARIES_DIR}/${binaryName}-${triple}${triple.includes('-windows-') ? '.exe' : ''}`
}

/** The target triple of `tauri build` options (`--target <triple>`, `--target=<triple>`, `-t <triple>`). */
export function passthroughTarget(passthrough: string[]): string | undefined {
  for (let i = 0; i < passthrough.length; i++) {
    const arg = passthrough[i]!
    if (arg === '--target' || arg === '-t') return passthrough[i + 1]
    if (arg.startsWith('--target=')) return arg.slice('--target='.length)
  }
  return undefined
}

/**
 * Local mode: `nuxt build` (the module turns it into one self-contained file for Bun), then `bun build --compile` into
 * `src-tauri/binaries/<name>-<triple>`. Returns the binary's path, relative to the app.
 */
export function buildSidecar(cwd: string, manifest: DesktopManifest, target: string | undefined, io: Io): string {
  if (!manifest.local) throw new Error('`desktop.mode` is not `local`: there is no server to compile.')
  const bun = resolveBun(io.env ?? process.env, io.probe, io.platform)
  if (!bun) throw new Error(BUN_MISSING)
  const triple = target ?? hostTriple(io)
  const bunTargetName = bunTarget(triple)
  io.log('Building the server (`nuxt build`)…')
  io.exec('npx', ['nuxt', 'build'], cwd)
  const entry = join(cwd, '.output/server/index.mjs')
  if (!existsSync(entry)) throw new Error('`nuxt build` did not write .output/server/index.mjs.')
  const output = sidecarPath(manifest.local.binaryName, triple)
  mkdirSync(dirname(join(cwd, output)), { recursive: true })
  io.log(`Compiling the server for ${triple} (\`${bunTargetName}\`)…`)
  io.exec(bun, ['build', '--compile', '--minify', '--sourcemap=none', `--target=${bunTargetName}`, entry, '--outfile', join(cwd, output)], cwd)
  io.log(`✔ ${output}`)
  return output
}

/** Local mode: a config file `tauri dev` / `tauri build` merge (`--config`), written under node_modules/.cache. */
function tauriConfigOverride(cwd: string, name: string, config: JsonObject): string {
  const file = join(cwd, 'node_modules/.cache/frigear-desktop', `${name}.json`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, toJson(config))
  return file
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
    env: io.env ?? process.env,
  })
}

/**
 * `frigear-desktop doctor --fix`: prepares the app (so local mode and its Tauri packages are known), runs the fixes of
 * the doctor's findings (rustup, bun.sh, one install per dependency type, init), then checks again. Never runs sudo: system
 * packages (Linux) and the Windows installers stay printed.
 */
export function fix(cwd: string, io: Io): DoctorFinding[] {
  const prepare = () => {
    try {
      io.exec('npx', ['nuxt', 'prepare'], cwd)
    }
    catch {
      io.error('⚠ `nuxt prepare` failed; fixing what does not need it.')
    }
  }
  prepare()
  const plan = planFixes(doctor(cwd, io))
  const pm = detectPackageManager(cwd, (io.env ?? process.env).npm_config_user_agent)
  for (const step of plan) {
    if (step.kind === 'xcode') {
      io.log('Installing the Xcode Command Line Tools (`xcode-select --install`): finish the dialog, then run this again.')
      io.exec('xcode-select', ['--install'], cwd)
    }
    else if (step.kind === 'rust') {
      io.log(`Installing Rust with rustup (${RUSTUP_INSTALL})…`)
      io.exec('sh', ['-c', RUSTUP_INSTALL], cwd)
    }
    else if (step.kind === 'bun') {
      const windows = io.platform === 'win32'
      const command = windows ? BUN_INSTALL.windows : BUN_INSTALL.unix
      io.log(`Installing Bun (${command})…`)
      if (windows) io.exec('powershell', ['-c', 'irm bun.sh/install.ps1 | iex'], cwd)
      else io.exec('bash', ['-c', command], cwd)
    }
    else if (step.kind === 'packages') {
      const [command, args] = addCommand(pm, step.names, step.dev)
      io.log(`Adding ${step.names.join(', ')} (\`${[command, ...args].join(' ')}\`)…`)
      io.exec(command, args, cwd)
      prepare()
    }
    else {
      init(cwd, loadGenerated(cwd, io), false, io)
    }
  }
  if (!plan.length) io.log('Nothing to fix automatically.')
  return doctor(cwd, io)
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
  if (findings.every(finding => finding.level === 'info')) io.log('✔ Ready to build the desktop app.')
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
        const findings = args.fix ? fix(cwd, io) : doctor(cwd, io)
        printFindings(findings, io)
        return findings.some(finding => finding.level === 'error') ? 1 : 0
      }
      case 'init':
        init(cwd, loadGenerated(cwd, io), args.force, io)
        return 0
      case 'sync':
        syncProject(cwd, loadGenerated(cwd, io), io)
        return 0
      case 'sidecar': {
        const generated = loadGenerated(cwd, io)
        buildSidecar(cwd, generated.manifest, args.target, io)
        return 0
      }
      case 'dev':
      case 'build': {
        if (!isResolvable('@tauri-apps/cli', cwd)) throw new Error('`@tauri-apps/cli` is not installed in the app: `pnpm add -D @tauri-apps/cli`.')
        const generated = loadGenerated(cwd, io)
        syncProject(cwd, generated, io)
        const tauriArgs = ['tauri', args.command]
        if (generated.manifest.local) {
          if (args.command === 'build') {
            // The server and the sidecar first; Tauri's own beforeBuildCommand would run `nuxt generate`.
            buildSidecar(cwd, generated.manifest, passthroughTarget(args.passthrough), io)
            tauriArgs.push('--config', tauriConfigOverride(cwd, 'tauri-build', { build: { beforeBuildCommand: '' } }))
          }
          else {
            // No sidecar under `tauri dev`: the window loads `nuxt dev` (devUrl).
            tauriArgs.push('--config', tauriConfigOverride(cwd, 'tauri-dev', { bundle: { externalBin: [] } }))
          }
        }
        const env = tauriEnv(io)
        if (env) io.exec('npx', [...tauriArgs, ...args.passthrough], cwd, env)
        else io.exec('npx', [...tauriArgs, ...args.passthrough], cwd)
        return 0
      }
    }
  }
  catch (error) {
    io.error(`✖ ${(error as Error).message}`)
    return 1
  }
}
