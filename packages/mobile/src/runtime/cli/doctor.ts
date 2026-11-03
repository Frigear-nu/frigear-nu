import type { MobileNativeManifest } from '../../types'
import { readAndroidStrings, readManifestLinks } from './manifest'
import { readPlistLocalNetworking, readPlistSchemes } from './plist'

export const IOS_PLIST = 'ios/App/App/Info.plist'
export const ANDROID_MANIFEST = 'android/app/src/main/AndroidManifest.xml'
export const ANDROID_STRINGS = 'android/app/src/main/res/values/strings.xml'

export interface DoctorInput {
  manifest: MobileNativeManifest
  /** The app's `package.json`. */
  packageJson: { dependencies?: Record<string, string>, devDependencies?: Record<string, string> } | null
  /** Reads a file relative to the app's root, `null` when it does not exist. */
  readFile: (path: string) => string | null
}

export interface DoctorFinding {
  level: 'error' | 'warning' | 'info'
  message: string
}

/**
 * Checks an app against what the module needs on a device:
 *
 * - every Capacitor plugin a feature uses is a dependency of the app (`cap sync` only links the app's own
 *   dependencies into the native projects, not the module's);
 * - the iOS and Android projects register the OAuth redirect scheme and the deep-link schemes.
 */
export function runDoctor(input: DoctorInput): DoctorFinding[] {
  const findings: DoctorFinding[] = []
  const { manifest } = input
  const deps = { ...input.packageJson?.dependencies }
  const devDeps = { ...input.packageJson?.devDependencies }
  const fix = 'Run `frigear-mobile native` to patch it.'

  if (!deps['@capacitor/cli'] && !devDeps['@capacitor/cli']) {
    findings.push({ level: 'error', message: '`@capacitor/cli` is not a dependency of the app: `pnpm add -D @capacitor/cli`.' })
  }
  for (const plugin of manifest.plugins) {
    if (deps[plugin.name]) continue
    const where = devDeps[plugin.name] ? 'is a devDependency, but `cap sync` only links `dependencies`' : 'is not a dependency of the app'
    findings.push({
      level: plugin.required ? 'error' : 'info',
      message: `\`${plugin.name}\` ${where} (${plugin.feature}): \`pnpm add ${plugin.name}\`.`,
    })
  }

  const plist = input.readFile(IOS_PLIST)
  if (plist !== null) {
    if (!deps['@capacitor/ios']) findings.push({ level: 'warning', message: 'The app has an `ios/` project but no `@capacitor/ios` dependency.' })
    try {
      const registered = readPlistSchemes(plist, { PRODUCT_BUNDLE_IDENTIFIER: manifest.appId }).map(scheme => scheme.toLowerCase())
      for (const scheme of manifest.schemes) {
        if (!registered.includes(scheme)) {
          findings.push({ level: 'error', message: `${IOS_PLIST} does not register the URL scheme "${scheme}"${scheme === schemeOf(manifest.redirectUri) ? ' of the OAuth redirect URI: sign-in cannot return to the app' : ''}. ${fix}` })
        }
      }
      if (manifest.allowLocalNetworking && !readPlistLocalNetworking(plist)) {
        findings.push({ level: 'info', message: `${IOS_PLIST} does not allow local networking: the app cannot reach a development server over http on your LAN. ${fix}` })
      }
    }
    catch (error) {
      findings.push({ level: 'warning', message: `${IOS_PLIST} could not be read: ${(error as Error).message}` })
    }
  }

  const androidManifest = input.readFile(ANDROID_MANIFEST)
  if (androidManifest !== null) {
    if (!deps['@capacitor/android']) findings.push({ level: 'warning', message: 'The app has an `android/` project but no `@capacitor/android` dependency.' })
    const links = readManifestLinks(androidManifest, readAndroidStrings(input.readFile(ANDROID_STRINGS) ?? ''))
    for (const scheme of manifest.schemes) {
      if (!links.schemes.includes(scheme)) {
        findings.push({ level: 'error', message: `${ANDROID_MANIFEST} has no intent filter for the scheme "${scheme}". ${fix}` })
      }
    }
    for (const host of manifest.hosts) {
      if (!links.hosts.includes(host.toLowerCase())) {
        findings.push({ level: 'warning', message: `${ANDROID_MANIFEST} has no app link for https://${host}. ${fix}` })
      }
    }
  }
  return findings
}

const schemeOf = (uri: string) => /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1]?.toLowerCase()
