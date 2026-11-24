import type { MobileNativeManifest } from '../../types'
import { readAndroidStrings, readManifestLinks } from './manifest'
import { dependsOn, embedsWatchApp, readAppTarget, readValue, readWatchTargets } from './pbxproj'
import { readPlistLocalNetworking, readPlistSchemes } from './plist'

export const IOS_PLIST = 'ios/App/App/Info.plist'
export const IOS_PBXPROJ = 'ios/App/App.xcodeproj/project.pbxproj'
export const ANDROID_MANIFEST = 'android/app/src/main/AndroidManifest.xml'
export const ANDROID_STRINGS = 'android/app/src/main/res/values/strings.xml'

export interface DoctorInput {
  manifest: MobileNativeManifest
  /** The app's `package.json`. */
  packageJson: { dependencies?: Record<string, string>, devDependencies?: Record<string, string> } | null
  /** Reads a file relative to the app's root, `null` when it does not exist. */
  readFile: (path: string) => string | null
  /** The folders in the app's `watch/` (the watch apps' sources). */
  watchFolders?: string[]
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
 * - the iOS and Android projects register the OAuth redirect scheme and the deep-link schemes;
 * - a watchOS companion target (`frigear-mobile watch`) is embedded in the iPhone app and names its bundle id.
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

  const pbxproj = input.readFile(IOS_PBXPROJ)
  if (pbxproj !== null) {
    try {
      findings.push(...checkWatchTargets(pbxproj, manifest.appId, input.watchFolders ?? []))
    }
    catch (error) {
      findings.push({ level: 'warning', message: `${IOS_PBXPROJ} could not be read: ${(error as Error).message}` })
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

/** A watch target must be embedded in the iPhone app and name its bundle id, or it never installs on the watch. */
function checkWatchTargets(pbxproj: string, appId: string, folders: string[]): DoctorFinding[] {
  const watches = readWatchTargets(pbxproj)
  const app = readAppTarget(pbxproj)
  const findings: DoctorFinding[] = []
  for (const folder of folders) {
    if (!watches.some(watch => watch.name === folder)) {
      findings.push({ level: 'warning', message: `watch/${folder}/ has no watch target in ${IOS_PBXPROJ}. Run \`frigear-mobile native --platform ios\` to add it.` })
    }
  }
  if (!watches.length || !app) return findings
  const settingOf = (settings: string | undefined, key: string) => (settings === undefined ? undefined : readValue(settings, key))
  for (const watch of watches) {
    if (!embedsWatchApp(pbxproj, app, watch)) {
      findings.push({ level: 'error', message: `The watch target "${watch.name}" is not embedded in ${app.name}: ${IOS_PBXPROJ} has no "Embed Watch Content" phase that copies ${watch.name}.app to $(CONTENTS_FOLDER_PATH)/Watch. Add it in Xcode (${app.name} → Build Phases), or remove the target and run \`frigear-mobile watch\` again.` })
    }
    if (!dependsOn(pbxproj, app, watch)) {
      findings.push({ level: 'warning', message: `${app.name} does not depend on the watch target "${watch.name}": building ${app.name} may embed a stale watch app.` })
    }
    for (const config of watch.configurations) {
      const companion = settingOf(config.settings, 'INFOPLIST_KEY_WKCompanionAppBundleIdentifier')
      const appBundleId = settingOf(app.configurations.find(other => other.name === config.name)?.settings, 'PRODUCT_BUNDLE_IDENTIFIER')
      const expected = appBundleId && !appBundleId.includes('$(') ? appBundleId : appId
      if (!companion) {
        findings.push({ level: 'error', message: `The watch target "${watch.name}" (${config.name}) has no WKCompanionAppBundleIdentifier: set it to "${expected}".` })
      }
      else if (companion !== expected) {
        findings.push({ level: 'error', message: `The watch target "${watch.name}" (${config.name}) names the companion app "${companion}", but the iPhone app is "${expected}": the watch app will not install.` })
      }
      const bundleId = settingOf(config.settings, 'PRODUCT_BUNDLE_IDENTIFIER')
      if (bundleId && !bundleId.includes('$(') && !bundleId.startsWith(`${expected}.`)) {
        findings.push({ level: 'error', message: `The watch target "${watch.name}" (${config.name}) has the bundle id "${bundleId}"; it must start with "${expected}.".` })
      }
    }
  }
  return findings
}

const schemeOf = (uri: string) => /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1]?.toLowerCase()
