import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MobileNativeManifest } from '../../types'
import { addWatchTarget as addWatchTargetToProject, readAppTarget, readValue, readWatchTargets } from './pbxproj'

export const IOS_PROJECT = 'ios/App/App.xcodeproj'
export const IOS_PBXPROJ = `${IOS_PROJECT}/project.pbxproj`
/** The watch apps' sources, committed with the app, outside the regenerable `ios/`: `watch/<Target>/`. */
export const WATCH_DIR = 'watch'

/** The template the watch app's sources are copied from (`templates/apple-watch` of the package, next to `src` / `dist`). */
const TEMPLATE_DIR = fileURLToPath(new URL('../../../templates/apple-watch/', import.meta.url))

export type WatchErrorCode = 'NO_IOS_PROJECT' | 'NO_MANIFEST' | 'INVALID_NAME' | 'INVALID_BUNDLE_ID' | 'INVALID_PROJECT'

export class WatchError extends Error {
  readonly code: WatchErrorCode
  constructor(code: WatchErrorCode, message: string) {
    super(message)
    this.name = 'WatchError'
    this.code = code
  }
}

export interface AddWatchTargetOptions {
  /** The app's directory (the one with `ios/` and `nuxt.config.ts`). */
  cwd: string
  /** Target, folder and Swift app name. Default: the app name without spaces + `Watch`, e.g. `MyAppWatch`. */
  name?: string
  /** The watch app's bundle id. Default: `<appId>.watchkitapp`. */
  bundleId?: string
  /** Overwrite the watch app's Swift sources and assets when they exist. */
  force?: boolean
  /** The app's resolved mobile settings. Default: `.nuxt/mobile/native.json`. */
  manifest?: Pick<MobileNativeManifest, 'appId' | 'appName'>
}

export interface AddWatchTargetResult {
  /** `added`: the target was added to the project; `exists`: the project already had a watch target, left alone. */
  status: 'added' | 'exists'
  /** The watch target's name (the existing one's for `exists`). */
  target: string
  bundleId: string
  /** The iPhone app's bundle id, `WKCompanionAppBundleIdentifier` of the watch app. */
  companionBundleId: string
  /** Files under `watch/<target>/` written, relative to the app. */
  written: string[]
  /** Files that existed and were kept (pass `force` to overwrite them). */
  kept: string[]
  /** Things to check, such as an app id that differs from the Xcode project's bundle id. */
  warnings: string[]
}

function readManifest(cwd: string): Pick<MobileNativeManifest, 'appId' | 'appName'> {
  for (const file of [join(cwd, '.nuxt/mobile/native.json'), join(cwd, 'node_modules/.cache/nuxt/.nuxt/mobile/native.json')]) {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as MobileNativeManifest
  }
  throw new WatchError('NO_MANIFEST', 'No .nuxt/mobile/native.json: run `nuxt prepare` (is `@frigear-nu/mobile` in the app\'s nuxt.config modules?).')
}

/** `My App` → `MyAppWatch`: a Swift type name and an Xcode target name. */
export function defaultWatchTargetName(appName: string): string {
  const words = appName.replace(/[^A-Z0-9]+/gi, ' ').trim().split(' ').filter(Boolean)
  const base = words.map(word => word[0]!.toUpperCase() + word.slice(1)).join('')
  return `${/^[A-Z]/i.test(base) ? base : `App${base}`}Watch`
}

function* templateFiles(dir: string, base = dir): Generator<string> {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* templateFiles(path, base)
    else yield relative(base, path)
  }
}

/** The watch apps of an app: the folders in `watch/`. */
export function watchFolders(cwd: string): string[] {
  const dir = join(cwd, WATCH_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(entry => !entry.startsWith('.') && statSync(join(dir, entry)).isDirectory()).sort()
}

const swiftString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/**
 * Adds an Apple Watch (watchOS SwiftUI) companion app to the Capacitor iOS project in `ios/App`: its sources in
 * `watch/<target>/` of the app (from the package's template; files that exist are kept), and a watchOS target in
 * `App.xcodeproj` that the iPhone app embeds, whose sources are that folder (`../../watch/<target>`). The sources live
 * outside `ios/`, so a regenerated `ios/` gets the target back from them (`frigear-mobile native` calls this for every
 * `watch/*\/` folder). A custom `bundleId` is kept in `watch/<target>.json` for that.
 * Running it again changes nothing: a project with a watch target is reported and left alone. Needs
 * `ios/App/App.xcodeproj`.
 */
export function addWatchTarget(options: AddWatchTargetOptions): AddWatchTargetResult {
  const { cwd } = options
  const pbxprojPath = join(cwd, IOS_PBXPROJ)
  if (!existsSync(pbxprojPath)) throw new WatchError('NO_IOS_PROJECT', `No ${IOS_PROJECT}: run \`frigear-mobile native --platform ios\` first.`)
  const manifest = options.manifest ?? readManifest(cwd)
  const warnings: string[] = []

  const pbxproj = readFileSync(pbxprojPath, 'utf8')
  let app
  try {
    app = readAppTarget(pbxproj)
  }
  catch (error) {
    throw new WatchError('INVALID_PROJECT', `${IOS_PBXPROJ} could not be read: ${(error as Error).message}`)
  }
  if (!app) throw new WatchError('INVALID_PROJECT', `${IOS_PBXPROJ} has no iPhone app target.`)

  // The watch app must name the bundle id the iPhone app is built with: the Xcode project's, when it is a literal.
  const projectBundleId = app.configurations.map(config => readValue(config.settings, 'PRODUCT_BUNDLE_IDENTIFIER')).find(Boolean)
  const companionBundleId = projectBundleId && !projectBundleId.includes('$(') ? projectBundleId : manifest.appId
  if (companionBundleId !== manifest.appId) {
    warnings.push(`The iPhone app's bundle id in ${IOS_PBXPROJ} is "${companionBundleId}", the app id is "${manifest.appId}". The watch app uses "${companionBundleId}"; run \`npx cap sync ios\` and this again if the app id is the right one.`)
  }

  const name = options.name ?? defaultWatchTargetName(manifest.appName || 'App')
  if (!/^[A-Z_]\w*$/i.test(name)) throw new WatchError('INVALID_NAME', `The watch target name "${name}" must be letters, digits and _, starting with a letter (it is also a Swift type name).`)
  if (name === app.name) throw new WatchError('INVALID_NAME', `The watch target cannot be named "${name}" like the iPhone app.`)
  const settingsFile = join(cwd, WATCH_DIR, `${name}.json`)
  const saved = existsSync(settingsFile) ? (JSON.parse(readFileSync(settingsFile, 'utf8')) as { bundleId?: string }).bundleId : undefined
  const bundleId = options.bundleId ?? saved ?? `${companionBundleId}.watchkitapp`
  if (!/^[\w.-]+$/.test(bundleId)) throw new WatchError('INVALID_BUNDLE_ID', `"${bundleId}" is not a valid bundle id.`)
  if (!bundleId.startsWith(`${companionBundleId}.`)) {
    throw new WatchError('INVALID_BUNDLE_ID', `The watch app's bundle id must start with the iPhone app's, "${companionBundleId}.", not "${bundleId}".`)
  }

  let result
  try {
    result = addWatchTargetToProject(pbxproj, { name, bundleId, companionBundleId, path: `../../${WATCH_DIR}/${name}`, displayName: manifest.appName || name })
  }
  catch (error) {
    throw new WatchError('INVALID_PROJECT', `${IOS_PBXPROJ}: ${(error as Error).message}`)
  }
  if (result.existing) {
    const existing = readWatchTargets(pbxproj).find(target => target.name === result.existing)
    const setting = (key: string) => existing?.configurations.map(config => readValue(config.settings, key)).find(Boolean)
    return {
      status: 'exists',
      target: result.existing,
      bundleId: setting('PRODUCT_BUNDLE_IDENTIFIER') ?? bundleId,
      companionBundleId: setting('INFOPLIST_KEY_WKCompanionAppBundleIdentifier') ?? companionBundleId,
      written: [],
      kept: [],
      warnings,
    }
  }

  // Sources first: a project that points at a missing folder does not build.
  const written: string[] = []
  const kept: string[] = []
  const substitute = (contents: string) => contents
    .replaceAll('__TARGET__', name)
    .replaceAll('__APP_NAME__', swiftString(manifest.appName || name))
  for (const file of templateFiles(TEMPLATE_DIR)) {
    const target = join(WATCH_DIR, name, file.replaceAll('__TARGET__', name))
    const path = join(cwd, target)
    if (existsSync(path) && !options.force) {
      kept.push(target)
      continue
    }
    mkdirSync(join(path, '..'), { recursive: true })
    const source = readFileSync(join(TEMPLATE_DIR, file), 'utf8')
    writeFileSync(path, file.endsWith('.swift') ? substitute(source) : source)
    written.push(target)
  }
  if (options.bundleId && options.bundleId !== `${companionBundleId}.watchkitapp`) {
    writeFileSync(settingsFile, `${JSON.stringify({ bundleId: options.bundleId }, null, 2)}\n`)
    written.push(join(WATCH_DIR, `${name}.json`))
  }
  writeFileSync(pbxprojPath, result.contents)
  return { status: 'added', target: name, bundleId, companionBundleId, written, kept, warnings }
}
