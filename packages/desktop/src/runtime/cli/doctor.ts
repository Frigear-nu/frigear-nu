import type { DesktopManifest } from '../../types'

export const TAURI_CONFIG = 'src-tauri/tauri.conf.json'
export const CARGO_TOML = 'src-tauri/Cargo.toml'

export interface DoctorFinding {
  level: 'error' | 'warning' | 'info'
  message: string
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
  /** The environment (`BUN`). */
  env?: Record<string, string | undefined>
}

/** The Bun command local mode compiles the server with: `BUN` when set, else `bun` on the PATH. `null` when neither runs. */
export function resolveBun(env: Record<string, string | undefined>, exec: DoctorInput['exec']): string | null {
  const command = env.BUN?.trim() || 'bun'
  return exec(command, ['--version']).ok ? command : null
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
  const rustup = input.platform === 'win32'
    ? 'install Rust from https://rustup.rs (the MSVC toolchain), then open a new terminal'
    : 'install Rust: `curl --proto \'=https\' --tlsv1.2 https://sh.rustup.rs -sSf | sh`, then open a new terminal'
  if (!input.exec('cargo', ['--version']).ok) error(`\`cargo\` was not found: ${rustup}.`)
  if (!input.exec('rustc', ['--version']).ok) error(`\`rustc\` was not found: ${rustup}.`)
  if (!input.isInstalled('@tauri-apps/cli')) error('`@tauri-apps/cli` is not installed in the app: `pnpm add -D @tauri-apps/cli`.')

  // OS prerequisites.
  if (input.platform === 'darwin') {
    if (!input.exec('xcode-select', ['-p']).ok) error('The Xcode Command Line Tools are missing: `xcode-select --install`.')
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
  if (config === null) warning(`${TAURI_CONFIG} does not exist: run \`frigear-desktop init\`.`)
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
  if (manifest?.local && !resolveBun(input.env ?? {}, input.exec)) {
    error(input.env?.BUN
      ? `\`BUN\` is set to "${input.env.BUN}", which does not run: local mode compiles the server with Bun.`
      : 'Bun was not found: local mode compiles the server with it. Install it from https://bun.sh, or set `BUN` to its path.')
  }

  if (!manifest) {
    info('The app\'s desktop settings were not found (.nuxt/desktop/manifest.json): run `nuxt prepare` to check its Tauri packages too.')
    return findings
  }
  for (const plugin of manifest.plugins) {
    if (input.isInstalled(plugin.name)) continue
    findings.push({ level: plugin.required ? 'error' : 'info', message: `\`${plugin.name}\` is not installed (${plugin.feature}): \`pnpm add ${plugin.name}\`.` })
  }
  return findings
}
