import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { MobileNativeManifest } from '../../types'
import { ANDROID_MANIFEST, ANDROID_STRINGS, IOS_PLIST, runDoctor, type DoctorFinding } from './doctor'
import { patchAndroidManifest, readAndroidStrings } from './manifest'
import { patchInfoPlist } from './plist'

type Platform = 'ios' | 'android'

export interface CliArgs {
  command: 'native' | 'doctor' | 'help'
  ifMissing: boolean
  platforms: Platform[]
  cwd: string
  strict: boolean
}

const USAGE = `Usage: frigear-mobile <command> [options]

Commands:
  native    Add the iOS / Android projects that are missing (npx cap add) and register the app's URL schemes in
            Info.plist and AndroidManifest.xml. Safe to run again.
  doctor    Check the native projects and the app's Capacitor plugins.

Options:
  --platform ios|android   Only this platform (repeatable). Default: those with @capacitor/ios / @capacitor/android installed.
  --if-missing             native: only set up platforms whose folder does not exist yet; leave existing projects alone.
  --cwd <dir>              The app's directory. Default: the current directory.
  --strict                 doctor: exit with 1 on errors.
`

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { command: 'help', ifMissing: false, platforms: [], cwd: process.cwd(), strict: false }
  const rest = [...argv]
  const command = rest.shift()
  if (command === 'native' || command === 'doctor') args.command = command
  else if (command && command !== 'help' && command !== '--help' && command !== '-h') throw new Error(`Unknown command "${command}".\n\n${USAGE}`)
  while (rest.length) {
    const arg = rest.shift()!
    const [flag, inline] = arg.split('=', 2) as [string, string | undefined]
    const value = () => inline ?? rest.shift() ?? ''
    if (flag === '--if-missing') args.ifMissing = true
    else if (flag === '--strict') args.strict = true
    else if (flag === '--cwd') args.cwd = resolve(value())
    else if (flag === '--platform') {
      const platform = value()
      if (platform !== 'ios' && platform !== 'android') throw new Error(`--platform must be ios or android, not "${platform}".`)
      args.platforms.push(platform)
    }
    else throw new Error(`Unknown option "${arg}".\n\n${USAGE}`)
  }
  return args
}

interface Io {
  log: (message: string) => void
  error: (message: string) => void
  /** Runs a command in the app's directory. */
  exec: (command: string, args: string[], cwd: string) => void
}

const defaultIo: Io = {
  log: message => console.log(message),
  error: message => console.error(message),
  exec: (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' }),
}

const readJson = <T>(file: string): T | null => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : null)

/** `.nuxt/mobile/native.json`, written by the module; prepares the app first when it is not there yet. */
function loadManifest(cwd: string, io: Io, refresh = false): MobileNativeManifest {
  const candidates = [join(cwd, '.nuxt/mobile/native.json'), join(cwd, 'node_modules/.cache/nuxt/.nuxt/mobile/native.json')]
  let file = refresh ? undefined : candidates.find(candidate => existsSync(candidate))
  if (!file) {
    io.log('Running `nuxt prepare` to resolve the app\'s mobile settings…')
    io.exec('npx', ['nuxt', 'prepare'], cwd)
    file = candidates.find(candidate => existsSync(candidate))
  }
  if (!file) throw new Error('No .nuxt/mobile/native.json: is `@frigear-nu/mobile` in the app\'s nuxt.config modules?')
  return JSON.parse(readFileSync(file, 'utf8')) as MobileNativeManifest
}

function printFindings(findings: DoctorFinding[], io: Io) {
  if (!findings.length) {
    io.log('✔ The native projects and plugins look right.')
    return
  }
  for (const finding of findings) {
    const line = `${finding.level === 'error' ? '✖' : finding.level === 'warning' ? '⚠' : 'ℹ'} ${finding.message}`
    if (finding.level === 'info') io.log(line)
    else io.error(line)
  }
}

export function doctor(cwd: string, manifest: MobileNativeManifest): DoctorFinding[] {
  return runDoctor({
    manifest,
    packageJson: readJson(join(cwd, 'package.json')),
    readFile: path => (existsSync(join(cwd, path)) ? readFileSync(join(cwd, path), 'utf8') : null),
  })
}

function patchFile(cwd: string, path: string, patch: (contents: string) => { contents: string, changed: boolean, added: string[] }, io: Io) {
  const file = join(cwd, path)
  if (!existsSync(file)) {
    io.error(`⚠ ${path} does not exist; skipped.`)
    return
  }
  const result = patch(readFileSync(file, 'utf8'))
  if (!result.changed) {
    io.log(`✔ ${path} is up to date.`)
    return
  }
  writeFileSync(file, result.contents)
  io.log(`✔ ${path}: added ${result.added.join(', ')}.`)
}

/** `frigear-mobile native`. */
export function native(args: CliArgs, io: Io = defaultIo): void {
  const { cwd } = args
  const pkg = readJson<{ dependencies?: Record<string, string>, devDependencies?: Record<string, string> }>(join(cwd, 'package.json'))
  const installed = (name: string) => !!(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name])
  const platforms = args.platforms.length
    ? args.platforms
    : (['ios', 'android'] as const).filter(platform => installed(`@capacitor/${platform}`) || existsSync(join(cwd, platform)))
  if (!platforms.length) throw new Error('No platform: `pnpm add @capacitor/ios` (and/or `@capacitor/android`), or pass --platform.')
  if (args.ifMissing && platforms.every(platform => existsSync(join(cwd, platform)))) {
    io.log(`✔ ${platforms.map(platform => `${platform}/`).join(' and ')} exist; nothing to do (--if-missing).`)
    return
  }
  // Fresh settings: the app id or redirect URI may have changed since the last prepare.
  const manifest = loadManifest(cwd, io, true)

  for (const platform of platforms) {
    const exists = existsSync(join(cwd, platform))
    if (exists && args.ifMissing) {
      io.log(`✔ ${platform}/ exists; left as it is (--if-missing).`)
      continue
    }
    if (!exists) {
      if (!installed(`@capacitor/${platform}`)) throw new Error(`\`@capacitor/${platform}\` is not a dependency of the app: \`pnpm add @capacitor/${platform}\`.`)
      ensureWebDir(cwd, io)
      io.log(`Adding the ${platform} project (npx cap add ${platform})…`)
      io.exec('npx', ['cap', 'add', platform], cwd)
    }
    if (platform === 'ios') {
      patchFile(cwd, IOS_PLIST, xml => patchInfoPlist(xml, {
        schemes: manifest.schemes,
        variables: { PRODUCT_BUNDLE_IDENTIFIER: manifest.appId },
        allowLocalNetworking: manifest.allowLocalNetworking,
      }), io)
    }
    else {
      const strings = existsSync(join(cwd, ANDROID_STRINGS)) ? readAndroidStrings(readFileSync(join(cwd, ANDROID_STRINGS), 'utf8')) : {}
      patchFile(cwd, ANDROID_MANIFEST, xml => patchAndroidManifest(xml, { schemes: manifest.schemes, hosts: manifest.hosts, strings }), io)
    }
  }
  printFindings(doctor(cwd, manifest), io)
}

/** `cap add` needs the web assets folder; a first run has not built the app yet. */
function ensureWebDir(cwd: string, io: Io) {
  const config = readJson<{ webDir?: string }>(join(cwd, 'capacitor.config.json'))
  const webDir = join(cwd, config?.webDir ?? '.output/public')
  if (existsSync(join(webDir, 'index.html'))) return
  mkdirSync(webDir, { recursive: true })
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Build the app</title><p>Run nuxt generate, then cap sync.</p>\n')
  io.log(`Created a placeholder ${join(config?.webDir ?? '.output/public', 'index.html')} (build the app before \`cap sync\`).`)
}

export async function main(argv: string[] = process.argv.slice(2), io: Io = defaultIo): Promise<number> {
  try {
    const args = parseArgs(argv)
    if (args.command === 'help') {
      io.log(USAGE)
      return 0
    }
    if (args.command === 'native') {
      native(args, io)
      return 0
    }
    const findings = doctor(args.cwd, loadManifest(args.cwd, io))
    printFindings(findings, io)
    return args.strict && findings.some(finding => finding.level === 'error') ? 1 : 0
  }
  catch (error) {
    io.error(`✖ ${(error as Error).message}`)
    return 1
  }
}
