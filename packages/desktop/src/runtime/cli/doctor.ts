import type { DesktopManifest } from '../../types'

export const TAURI_CONFIG = 'src-tauri/tauri.conf.json'
export const CARGO_TOML = 'src-tauri/Cargo.toml'
export const BUN_MISSING = 'Bun was not found: local mode compiles the server with it. Run `frigear-desktop doctor --fix`, install it from https://bun.sh, or set `BUN` to its path.'

/** What `frigear-desktop doctor --fix` does about a finding. */
export type DoctorFix
  = | { kind: 'rust' }
    | { kind: 'xcode' }
    | { kind: 'bun' }
    | { kind: 'packages', names: string[], dev: boolean }
    | { kind: 'init' }

export interface DoctorFinding {
  level: 'error' | 'warning' | 'info'
  message: string
  /** Set when `doctor --fix` can fix it without help. */
  fix?: DoctorFix
}

export interface DoctorInput {
  platform: NodeJS.Platform
  /** Runs a command, without a shell prompt; `ok` is a zero exit status. */
  exec: (command: string, args: string[]) => { ok: boolean, stdout: string }
  /** Whether a package resolves from the app's directory. */
  isInstalled: (pkg: string) => boolean
  /** Reads a file relative to the app's root, `null` when it does not exist. */
  readFile: (path: string) => string | null
  /** `.nuxt/desktop/manifest.json`, `null` when the app was not prepared. */
  manifest: DesktopManifest | null
  /** The environment (`BUN`, `BUN_INSTALL`, `CARGO_HOME`, `HOME`). */
  env?: Record<string, string | undefined>
}

type Env = Record<string, string | undefined>

/**
 * A tool's command: `name` when it runs from the PATH, else `<dir>/<name>` from the first of `dirs` it runs in, the
 * folders its installer puts it in (a terminal opened before the install does not have them on its PATH yet).
 */
function findTool(name: string, dirs: (string | undefined)[], exec: DoctorInput['exec'], platform: NodeJS.Platform): { command: string, dir: string } | null {
  if (exec(name, ['--version']).ok) return { command: name, dir: '' }
  const separator = platform === 'win32' ? '\\' : '/'
  for (const dir of dirs) {
    const command = dir && `${dir}${separator}${name}${platform === 'win32' ? '.exe' : ''}`
    if (command && exec(command, ['--version']).ok) return { command, dir: dir! }
  }
  return null
}

/** `<base>/bin` for the installer's home variable (`CARGO_HOME`) and `~/<dotDir>/bin`. */
function installDirs(env: Env, platform: NodeJS.Platform, homeVariable: string, dotDir: string): (string | undefined)[] {
  const separator = platform === 'win32' ? '\\' : '/'
  const home = env.HOME || env.USERPROFILE
  return [env[homeVariable] && [env[homeVariable], 'bin'].join(separator), home && [home, dotDir, 'bin'].join(separator)]
}

/**
 * The Bun command local mode compiles the server with: `BUN` when set, else `bun` on the PATH, else the one bun.sh's
 * installer put in `$BUN_INSTALL/bin` or `~/.bun/bin`. `null` when none runs.
 */
export function resolveBun(env: Env, exec: DoctorInput['exec'], platform: NodeJS.Platform = process.platform): string | null {
  if (env.BUN?.trim()) return exec(env.BUN.trim(), ['--version']).ok ? env.BUN.trim() : null
  return findTool('bun', installDirs(env, platform, 'BUN_INSTALL', '.bun'), exec, platform)?.command ?? null
}

/**
 * Where `cargo` runs from: `''` when it is on the PATH, else the rustup directory it was found in (`$CARGO_HOME/bin`,
 * `~/.cargo/bin`). `null` when there is no Rust.
 */
export function resolveCargo(env: Env, exec: DoctorInput['exec'], platform: NodeJS.Platform): string | null {
  return findTool('cargo', installDirs(env, platform, 'CARGO_HOME', '.cargo'), exec, platform)?.dir ?? null
}

/**
 * Checks the machine and the app for building the desktop app: the Rust toolchain, `@tauri-apps/cli`, the OS
 * prerequisites (Xcode Command Line Tools, WebView2, WebKitGTK 4.1), the `src-tauri/` project and the Tauri packages
 * the enabled features use. Errors block a build.
 */
export function runDoctor(input: DoctorInput): DoctorFinding[] {
  const findings: DoctorFinding[] = []
  const error = (message: string) => findings.push({ level: 'error', message })
  const warning = (message: string) => findings.push({ level: 'warning', message })
  const info = (message: string) => findings.push({ level: 'info', message })

  // Toolchain.
  const env = input.env ?? {}
  const windows = input.platform === 'win32'
  const rustup = windows
    ? 'install Rust from https://rustup.rs (the MSVC toolchain)'
    : 'run `frigear-desktop doctor --fix`, or install Rust with `curl --proto \'=https\' --tlsv1.2 https://sh.rustup.rs -sSf | sh`'
  const rustFix = windows ? undefined : { kind: 'rust' } as const
  const cargoDir = resolveCargo(env, input.exec, input.platform)
  if (cargoDir === null) {
    findings.push({ level: 'error', message: `\`cargo\` was not found: ${rustup}.`, fix: rustFix })
  }
  else {
    const rustc = cargoDir ? `${cargoDir}${windows ? '\\' : '/'}rustc${windows ? '.exe' : ''}` : 'rustc'
    if (!input.exec(rustc, ['--version']).ok) findings.push({ level: 'error', message: `\`rustc\` was not found: ${rustup}.`, fix: rustFix })
    else if (cargoDir) info(`Rust is installed in ${cargoDir}, which is not on this terminal's PATH yet; \`frigear-desktop dev\` and \`build\` use it from there.`)
  }
  if (!input.isInstalled('@tauri-apps/cli')) {
    findings.push({ level: 'error', message: '`@tauri-apps/cli` is not installed in the app: `pnpm add -D @tauri-apps/cli`.', fix: { kind: 'packages', names: ['@tauri-apps/cli'], dev: true } })
  }

  // OS prerequisites.
  if (input.platform === 'darwin') {
    if (!input.exec('xcode-select', ['-p']).ok) findings.push({ level: 'error', message: 'The Xcode Command Line Tools are missing: `xcode-select --install`.', fix: { kind: 'xcode' } })
  }
  else if (input.platform === 'win32') {
    info('Windows needs the Microsoft C++ Build Tools ("Desktop development with C++") and WebView2. WebView2 ships with Windows 10 (1803 and later) and 11; elsewhere install the Evergreen runtime from https://developer.microsoft.com/microsoft-edge/webview2/.')
  }
  else if (input.platform === 'linux') {
    if (!input.exec('pkg-config', ['--version']).ok) {
      error('`pkg-config` was not found: install it with your system\'s packages (Debian/Ubuntu: `sudo apt install pkg-config`).')
    }
    else if (!input.exec('pkg-config', ['--exists', 'webkit2gtk-4.1']).ok) {
      error('WebKitGTK 4.1 is missing. Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`; Fedora: `sudo dnf install webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel`; Arch: `sudo pacman -S webkit2gtk-4.1 base-devel openssl libappindicator-gtk3 librsvg`.')
    }
  }

  // The project.
  const manifest = input.manifest
  const config = input.readFile(TAURI_CONFIG)
  if (config === null) findings.push({ level: 'warning', message: `${TAURI_CONFIG} does not exist: run \`frigear-desktop init\`.`, fix: { kind: 'init' } })
  const cargo = input.readFile(CARGO_TOML)
  if (manifest && cargo !== null) {
    if (manifest.singleInstance && !/tauri-plugin-single-instance[^\n]*deep-link/.test(cargo)) {
      warning(`${CARGO_TOML} has no \`tauri-plugin-single-instance\` with the \`deep-link\` feature: on Windows and Linux a deep link (and the sign-in redirect) starts a second app instead of reaching the running one.`)
    }
    if (manifest.autostart && !cargo.includes('tauri-plugin-autostart')) error(`\`desktop.autostart\` is on but ${CARGO_TOML} has no \`tauri-plugin-autostart\`.`)
    if (manifest.updater && !cargo.includes('tauri-plugin-updater')) error(`\`desktop.updater\` is set but ${CARGO_TOML} has no \`tauri-plugin-updater\`.`)
    if (manifest.local && !cargo.includes('tauri-plugin-shell')) {
      error(`\`desktop.mode\` is \`local\` but ${CARGO_TOML} has no \`tauri-plugin-shell\`, which starts the bundled server: run \`frigear-desktop init --force\` in a clean checkout, or add it and the \`local_server\` code of a fresh src/lib.rs.`)
    }
  }
  if (manifest?.local && !resolveBun(env, input.exec, input.platform)) {
    if (env.BUN) error(`\`BUN\` is set to "${env.BUN}", which does not run: local mode compiles the server with Bun.`)
    else findings.push({ level: 'error', message: BUN_MISSING, fix: { kind: 'bun' } })
  }

  if (!manifest) {
    info('The app\'s desktop settings were not found (.nuxt/desktop/manifest.json): run `nuxt prepare` to check its Tauri packages too.')
    return findings
  }
  for (const plugin of manifest.plugins) {
    if (input.isInstalled(plugin.name)) continue
    findings.push({ level: plugin.required ? 'error' : 'info', message: `\`${plugin.name}\` is not installed (${plugin.feature}): \`pnpm add ${plugin.name}\`.`, fix: { kind: 'packages', names: [plugin.name], dev: false } })
  }
  return findings
}
