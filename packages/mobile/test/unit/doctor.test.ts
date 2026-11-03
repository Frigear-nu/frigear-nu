import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANDROID_MANIFEST, ANDROID_STRINGS, IOS_PLIST, runDoctor } from '../../src/runtime/cli/doctor'
import { patchAndroidManifest } from '../../src/runtime/cli/manifest'
import { patchInfoPlist } from '../../src/runtime/cli/plist'
import { usedPlugins } from '../../src/build'
import type { MobileNativeManifest } from '../../src/types'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

const manifest: MobileNativeManifest = {
  appId: 'nu.frigear.app',
  appName: 'Frigear',
  redirectUri: 'nu.frigear.app:/auth/callback',
  schemes: ['nu.frigear.app'],
  hosts: [],
  allowLocalNetworking: true,
  plugins: usedPlugins({ nativeChrome: true, statusBar: true, keyboardAccessoryBar: false, oauth: true }),
}

const allDeps = Object.fromEntries([...manifest.plugins.map(plugin => plugin.name), '@capacitor/ios', '@capacitor/android'].map(name => [name, '^8.0.0']))

describe('runDoctor', () => {
  it('is quiet for an app with everything in place', () => {
    const files: Record<string, string> = {
      [IOS_PLIST]: patchInfoPlist(fixture('Info.plist'), { schemes: manifest.schemes, allowLocalNetworking: true }).contents,
      [ANDROID_MANIFEST]: patchAndroidManifest(fixture('AndroidManifest.xml'), { schemes: manifest.schemes }).contents,
      [ANDROID_STRINGS]: fixture('strings.xml'),
    }
    expect(runDoctor({
      manifest,
      packageJson: { dependencies: allDeps, devDependencies: { '@capacitor/cli': '^8.0.0' } },
      readFile: path => files[path] ?? null,
    })).toEqual([])
  })

  it('reports missing plugins (devDependencies do not count) and the CLI', () => {
    const findings = runDoctor({
      manifest,
      packageJson: { dependencies: { '@capacitor/core': '^8' }, devDependencies: { '@capacitor/app': '^8' } },
      readFile: () => null,
    })
    const messages = findings.map(finding => `${finding.level}: ${finding.message}`)
    expect(messages).toContain('error: `@capacitor/cli` is not a dependency of the app: `pnpm add -D @capacitor/cli`.')
    expect(messages.find(message => message.includes('`@capacitor/app` is a devDependency'))).toMatch(/^error/)
    expect(messages.find(message => message.includes('@capacitor/browser'))).toMatch(/^error/)
    expect(messages.find(message => message.includes('@capacitor/haptics'))).toMatch(/^info/)
    expect(messages.find(message => message.includes('@capgo/capacitor-native-navigation'))).toMatch(/^info/)
    expect(messages.some(message => message.includes('@capacitor/keyboard'))).toBe(false)
  })

  it('reports native projects that do not register the redirect scheme', () => {
    const findings = runDoctor({
      manifest,
      packageJson: { dependencies: allDeps, devDependencies: { '@capacitor/cli': '^8.0.0' } },
      readFile: path => ({ [IOS_PLIST]: fixture('Info.plist'), [ANDROID_MANIFEST]: fixture('AndroidManifest.xml') })[path] ?? null,
    })
    expect(findings.map(finding => finding.level)).toEqual(['error', 'info', 'error'])
    expect(findings[0]!.message).toMatch(/does not register the URL scheme "nu.frigear.app" of the OAuth redirect URI/)
    expect(findings[1]!.message).toMatch(/local networking/)
    expect(findings[2]!.message).toMatch(/AndroidManifest.xml has no intent filter for the scheme "nu.frigear.app"/)
  })
})
