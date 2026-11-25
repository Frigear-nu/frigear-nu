import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IOS_PBXPROJ, runDoctor } from '../../src/runtime/cli/doctor'
import { main, parseArgs } from '../../src/runtime/cli/main'
import { addWatchTarget as addWatchTargetToProject, dependsOn, embedsWatchApp, listObjects, objectBody, readAppTarget, readValue, readWatchTargets } from '../../src/runtime/cli/pbxproj'
import { addWatchTarget, defaultWatchTargetName, WatchError } from '../../src/runtime/cli/watch'
import type { MobileNativeManifest } from '../../src/types'

// Capacitor 8's iOS (Swift Package Manager) template, as `cap add ios` writes it, with the app id `cap add` sets.
const pbxproj = readFileSync(new URL('./fixtures/project.pbxproj', import.meta.url), 'utf8')
  .replaceAll('com.getcapacitor.App', 'nu.frigear.app')

const options = { name: 'FrigearWatch', bundleId: 'nu.frigear.app.watchkitapp', companionBundleId: 'nu.frigear.app', displayName: 'Frigear' }

describe('pbxproj addWatchTarget', () => {
  const { contents, changed } = addWatchTargetToProject(pbxproj, options)

  it('adds a watchOS app target with Debug and Release configurations', () => {
    expect(changed).toBe(true)
    const [watch, ...others] = readWatchTargets(contents)
    expect(others).toEqual([])
    expect(watch).toMatchObject({ name: 'FrigearWatch', productType: 'com.apple.product-type.application' })
    expect(watch!.configurations.map(config => config.name)).toEqual(['Debug', 'Release'])
    for (const { settings } of watch!.configurations) {
      expect(readValue(settings, 'SDKROOT')).toBe('watchos')
      expect(readValue(settings, 'WATCHOS_DEPLOYMENT_TARGET')).toBe('10.0')
      expect(readValue(settings, 'GENERATE_INFOPLIST_FILE')).toBe('YES')
      expect(readValue(settings, 'INFOPLIST_KEY_WKCompanionAppBundleIdentifier')).toBe('nu.frigear.app')
      expect(readValue(settings, 'PRODUCT_BUNDLE_IDENTIFIER')).toBe('nu.frigear.app.watchkitapp')
    }
    expect(objectBody(contents, readWatchTargets(contents)[0]!.productReference!)).toContain('path = FrigearWatch.app;')
  })

  it('takes its sources from a file-system synchronized group in the main group', () => {
    const groups = listObjects(contents).filter(object => object.isa === 'PBXFileSystemSynchronizedRootGroup')
    expect(groups).toHaveLength(1)
    expect(objectBody(contents, groups[0]!.id)).toContain('path = FrigearWatch;')
    const outside = addWatchTargetToProject(pbxproj, { ...options, path: '../../watch/FrigearWatch' }).contents
    const group = listObjects(outside).find(object => object.isa === 'PBXFileSystemSynchronizedRootGroup')!
    expect(objectBody(outside, group.id)).toMatch(/name = FrigearWatch;\s+path = \.\.\/\.\.\/watch\/FrigearWatch;/)
    expect(contents).toMatch(new RegExp(`fileSystemSynchronizedGroups = \\(\\n\\t+${groups[0]!.id} /\\* FrigearWatch \\*/,`))
    expect(contents).toContain(`${groups[0]!.id} /* FrigearWatch */,\n\t\t\t);\n\t\t\tsourceTree = "<group>";`)
    // Synchronized groups need the Xcode 16 project format.
    expect(contents).toMatch(/^\tobjectVersion = 70;$/m)
  })

  it('embeds the watch app in App and makes App depend on it', () => {
    const app = readAppTarget(contents)!
    const watch = readWatchTargets(contents)[0]!
    expect(app.name).toBe('App')
    expect(embedsWatchApp(contents, app, watch)).toBe(true)
    expect(dependsOn(contents, app, watch)).toBe(true)
    expect(contents).toContain('dstPath = "$(CONTENTS_FOLDER_PATH)/Watch";')
    expect(contents).toContain('name = "Embed Watch Content";')
  })

  it('keeps the sections in order and every reference resolvable', () => {
    const sections = [...contents.matchAll(/^\/\* Begin (\w+) section \*\/$/gm)].map(match => match[1]!)
    expect(sections).toEqual([...sections].sort())
    const ids = new Set(listObjects(contents).map(object => object.id))
    for (const [, id] of contents.matchAll(/\b([0-9A-F]{24})\b/g)) expect(ids.has(id!)).toBe(true)
    expect(contents.split('{').length).toBe(contents.split('}').length)
  })

  it('is a no-op when the project has a watch target', () => {
    expect(addWatchTargetToProject(contents, options)).toEqual({ contents, changed: false, existing: 'FrigearWatch' })
    expect(addWatchTargetToProject(contents, { ...options, name: 'OtherWatch' }).existing).toBe('FrigearWatch')
  })

  it('refuses a name another target has', () => {
    expect(() => addWatchTargetToProject(pbxproj, { ...options, name: 'App' })).toThrow(/already has a target named "App"/)
  })
})

describe('addWatchTarget', () => {
  let dir: string
  const manifest = { appId: 'nu.frigear.app', appName: 'Frigear "Crew"' }
  const project = () => readFileSync(join(dir, IOS_PBXPROJ), 'utf8')

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frigear-watch-'))
    mkdirSync(join(dir, 'ios/App/App.xcodeproj'), { recursive: true })
    writeFileSync(join(dir, IOS_PBXPROJ), pbxproj)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes the sources from the template and adds the target; a second run changes nothing', () => {
    const result = addWatchTarget({ cwd: dir, manifest })
    expect(result).toMatchObject({ status: 'added', target: 'FrigearCrewWatch', bundleId: 'nu.frigear.app.watchkitapp', companionBundleId: 'nu.frigear.app', kept: [], warnings: [] })
    expect(result.written).toEqual(expect.arrayContaining([
      'watch/FrigearCrewWatch/FrigearCrewWatchApp.swift',
      'watch/FrigearCrewWatch/ContentView.swift',
      'watch/FrigearCrewWatch/PhoneSession.swift',
      'watch/FrigearCrewWatch/Assets.xcassets/AppIcon.appiconset/Contents.json',
      'watch/FrigearCrewWatch/Assets.xcassets/AccentColor.colorset/Contents.json',
    ]))
    const app = readFileSync(join(dir, 'watch/FrigearCrewWatch/FrigearCrewWatchApp.swift'), 'utf8')
    expect(app).toContain('struct FrigearCrewWatchApp: App')
    expect(app).not.toContain('__TARGET__')
    expect(readFileSync(join(dir, 'watch/FrigearCrewWatch/ContentView.swift'), 'utf8')).toContain('Text("Frigear \\"Crew\\"")')
    expect(readWatchTargets(project()).map(target => target.name)).toEqual(['FrigearCrewWatch'])

    const after = project()
    expect(addWatchTarget({ cwd: dir, manifest })).toMatchObject({ status: 'exists', target: 'FrigearCrewWatch', written: [] })
    expect(project()).toBe(after)
  })

  it('keeps existing sources unless forced', () => {
    mkdirSync(join(dir, 'watch/Wrist'), { recursive: true })
    writeFileSync(join(dir, 'watch/Wrist/ContentView.swift'), '// mine')
    const result = addWatchTarget({ cwd: dir, manifest, name: 'Wrist', bundleId: 'nu.frigear.app.wrist' })
    expect(result.kept).toEqual(['watch/Wrist/ContentView.swift'])
    // A custom bundle id is kept for a regenerated ios/.
    expect(JSON.parse(readFileSync(join(dir, 'watch/Wrist.json'), 'utf8'))).toEqual({ bundleId: 'nu.frigear.app.wrist' })
    expect(readFileSync(join(dir, 'watch/Wrist/ContentView.swift'), 'utf8')).toBe('// mine')

    writeFileSync(join(dir, IOS_PBXPROJ), pbxproj)
    const forced = addWatchTarget({ cwd: dir, manifest, name: 'Wrist', force: true })
    expect(forced.written).toContain('watch/Wrist/ContentView.swift')
    expect(forced.bundleId).toBe('nu.frigear.app.wrist')
    expect(readFileSync(join(dir, 'watch/Wrist/ContentView.swift'), 'utf8')).toContain('struct ContentView')
  })

  it('throws typed errors', () => {
    const code = (run: () => unknown) => {
      try {
        run()
      }
      catch (error) {
        expect(error).toBeInstanceOf(WatchError)
        return (error as WatchError).code
      }
    }
    expect(code(() => addWatchTarget({ cwd: dir, manifest, name: 'my watch' }))).toBe('INVALID_NAME')
    expect(code(() => addWatchTarget({ cwd: dir, manifest, bundleId: 'com.other.watch' }))).toBe('INVALID_BUNDLE_ID')
    expect(code(() => addWatchTarget({ cwd: dir }))).toBe('NO_MANIFEST')
    rmSync(join(dir, 'ios'), { recursive: true })
    expect(code(() => addWatchTarget({ cwd: dir, manifest }))).toBe('NO_IOS_PROJECT')
    expect(existsSync(join(dir, 'ios'))).toBe(false)
  })

  it('uses the bundle id of the Xcode project and warns when it differs from the app id', () => {
    const result = addWatchTarget({ cwd: dir, manifest: { appId: 'nu.frigear.other', appName: 'Frigear' } })
    expect(result.companionBundleId).toBe('nu.frigear.app')
    expect(result.bundleId).toBe('nu.frigear.app.watchkitapp')
    expect(result.warnings[0]).toMatch(/nu\.frigear\.other/)
  })

  it('derives the target name from the app name', () => {
    expect(defaultWatchTargetName('my app')).toBe('MyAppWatch')
    expect(defaultWatchTargetName('42 crew')).toBe('App42CrewWatch')
    expect(defaultWatchTargetName('')).toBe('AppWatch')
  })
})

describe('doctor: watch target', () => {
  const manifest: MobileNativeManifest = {
    appId: 'nu.frigear.app', appName: 'Frigear', redirectUri: 'nu.frigear.app:/auth/callback', schemes: [], hosts: [],
    allowLocalNetworking: false, plugins: [],
  }
  const doctor = (project: string) => runDoctor({
    manifest,
    packageJson: { devDependencies: { '@capacitor/cli': '^8' } },
    readFile: path => (path === IOS_PBXPROJ ? project : null),
  })
  const withWatch = addWatchTargetToProject(pbxproj, options).contents

  it('is quiet for a project without a watch target and for one set up by `watch`', () => {
    expect(doctor(pbxproj)).toEqual([])
    expect(doctor(withWatch)).toEqual([])
  })

  it('warns about a watch/ folder without a target', () => {
    const findings = runDoctor({
      manifest,
      packageJson: { devDependencies: { '@capacitor/cli': '^8' } },
      readFile: path => (path === IOS_PBXPROJ ? withWatch : null),
      watchFolders: ['FrigearWatch', 'Wrist'],
    })
    expect(findings).toEqual([expect.objectContaining({ level: 'warning', message: expect.stringContaining('watch/Wrist/ has no watch target') })])
  })

  it('reports a watch app that is not embedded', () => {
    const embedPhase = /\w{24} \/\* Embed Watch Content \*\/,\n/.exec(withWatch)![0]
    const findings = doctor(withWatch.replace(embedPhase, ''))
    expect(findings).toEqual([expect.objectContaining({ level: 'error', message: expect.stringContaining('not embedded in App') })])
  })

  it('reports a companion bundle id that is not the iPhone app', () => {
    const findings = doctor(withWatch.replaceAll('INFOPLIST_KEY_WKCompanionAppBundleIdentifier = nu.frigear.app;', 'INFOPLIST_KEY_WKCompanionAppBundleIdentifier = nu.frigear.old;'))
    expect(findings.map(finding => finding.message)).toEqual([
      expect.stringContaining('(Debug) names the companion app "nu.frigear.old"'),
      expect.stringContaining('(Release) names the companion app "nu.frigear.old"'),
    ])
  })
})

describe('frigear-mobile watch', () => {
  let dir: string
  const log: string[] = []
  const exec = vi.fn((_command: string, args: string[], cwd: string) => {
    if (args[0] === 'cap' && args[2] === 'ios') {
      mkdirSync(join(cwd, 'ios/App/App.xcodeproj'), { recursive: true })
      mkdirSync(join(cwd, 'ios/App/App'), { recursive: true })
      writeFileSync(join(cwd, IOS_PBXPROJ), pbxproj)
      writeFileSync(join(cwd, 'ios/App/App/Info.plist'), readFileSync(new URL('./fixtures/Info.plist', import.meta.url), 'utf8'))
    }
    if (args[0] === 'nuxt') {
      mkdirSync(join(cwd, '.nuxt/mobile'), { recursive: true })
      writeFileSync(join(cwd, '.nuxt/mobile/native.json'), JSON.stringify({
        appId: 'nu.frigear.app', appName: 'Frigear', redirectUri: 'nu.frigear.app:/auth/callback', schemes: ['nu.frigear.app'],
        hosts: [], allowLocalNetworking: false, plugins: [],
      }))
    }
  })
  const io = { log: (message: string) => log.push(message), error: (message: string) => log.push(message), exec }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frigear-mobile-watch-'))
    log.length = 0
    exec.mockClear()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@capacitor/ios': '^8' }, devDependencies: { '@capacitor/cli': '^8' } }))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('parses its options, which other commands reject', () => {
    expect(parseArgs(['watch', '--name', 'Wrist', '--bundle-id=nu.frigear.app.wrist', '--force', '--cwd', '/tmp/app']))
      .toMatchObject({ command: 'watch', name: 'Wrist', bundleId: 'nu.frigear.app.wrist', force: true, cwd: '/tmp/app' })
    expect(() => parseArgs(['doctor', '--name', 'Wrist'])).toThrow(/Unknown option/)
    expect(() => parseArgs(['watch', '--force=yes'])).toThrow(/takes no value/)
  })

  it('adds the iOS project when it is missing, then the watch target; a second run reports it', async () => {
    expect(await main(['watch', '--cwd', dir], io)).toBe(0)
    expect(exec.mock.calls.map(([command, args]) => [command, ...args].join(' '))).toEqual(['npx nuxt prepare', 'npx cap add ios'])
    expect(readWatchTargets(readFileSync(join(dir, IOS_PBXPROJ), 'utf8')).map(target => target.name)).toEqual(['FrigearWatch'])
    expect(log.join('\n')).toContain('Next steps')

    log.length = 0
    expect(await main(['watch', '--cwd', dir], io)).toBe(0)
    expect(log.join('\n')).toMatch(/already has the watch target "FrigearWatch"/)
    expect(existsSync(join(dir, 'watch/FrigearWatch/FrigearWatchApp.swift'))).toBe(true)
  })

  it('native adds the watch target back to a regenerated ios/', async () => {
    expect(await main(['watch', '--cwd', dir], io)).toBe(0)
    rmSync(join(dir, 'ios'), { recursive: true })
    expect(await main(['native', '--if-missing', '--cwd', dir], io)).toBe(0)
    const project = readFileSync(join(dir, IOS_PBXPROJ), 'utf8')
    expect(readWatchTargets(project).map(target => target.name)).toEqual(['FrigearWatch'])
    expect(project).toContain('path = ../../watch/FrigearWatch;')

    // --if-missing with ios/ in place: the target is there, nothing changes.
    expect(await main(['native', '--if-missing', '--cwd', dir], io)).toBe(0)
    expect(readFileSync(join(dir, IOS_PBXPROJ), 'utf8')).toBe(project)
  })
})
