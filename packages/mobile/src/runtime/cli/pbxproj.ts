// A small, focused editor for Xcode's `project.pbxproj` (an old-style ASCII plist). It edits the file as text, like the
// Info.plist and AndroidManifest.xml patchers: only the objects of a watchOS companion target are added, and every
// other byte of the project stays as Xcode wrote it.

import { randomBytes } from 'node:crypto'

interface PbxObject {
  id: string
  /** Index of the line that defines the object. */
  start: number
  /** Index just after the object's closing `};`. */
  end: number
  /** The text between the object's braces. */
  body: string
}

/** Index of the brace that closes the one at `open`, skipping quoted strings. */
function closingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
    }
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return i
  }
  throw new Error('project.pbxproj: unbalanced braces.')
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every object of the `objects` dictionary, in file order. */
function allObjects(text: string): PbxObject[] {
  const objects: PbxObject[] = []
  for (const match of text.matchAll(/^\t\t(\w+)(?: \/\*.*?\*\/)? = \{/gm)) {
    const open = match.index + match[0].length - 1
    const close = closingBrace(text, open)
    objects.push({ id: match[1]!, start: match.index, end: close + 2, body: text.slice(open + 1, close) })
  }
  return objects
}

function findObject(text: string, id: string): PbxObject | undefined {
  const match = new RegExp(`^\\t\\t${escapeRegExp(id)}(?: /\\*.*?\\*/)? = \\{`, 'm').exec(text)
  if (!match) return undefined
  const open = match.index + match[0].length - 1
  const close = closingBrace(text, open)
  return { id, start: match.index, end: close + 2, body: text.slice(open + 1, close) }
}

/** `text` without its `/* comments *\/` (outside quoted strings). */
function stripComments(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      const start = i
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
      out += text.slice(start, i + 1)
    }
    else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 1
    }
    else out += text[i]
  }
  return out
}

const unquote = (value: string) => value.startsWith('"') ? value.slice(1, -1).replace(/\\(.)/g, '$1') : value

/** The value of `key` in an object body (or a nested `buildSettings` block), unquoted. */
export function readValue(body: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|[\\s;{])${escapeRegExp(key)} = ("(?:[^"\\\\]|\\\\.)*"|[^;"]+);`).exec(stripComments(body))
  return match ? unquote(match[1]!.trim()) : undefined
}

/** The ids (or plain values) of the list `key = ( ... );` in an object body. */
function readList(body: string, key: string): string[] {
  const match = new RegExp(`(?:^|[\\s;{])${escapeRegExp(key)} = \\(([\\s\\S]*?)\\);`).exec(stripComments(body))
  if (!match) return []
  return match[1]!.split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(unquote)
}

/** Quotes a value when the plist format needs it. */
const quote = (value: string) => /^[\w$/:.-]+$/.test(value) && !value.includes('//') ? value : `"${value.replace(/(["\\])/g, '\\$1')}"`

const isa = (object: PbxObject) => readValue(object.body, 'isa')

/** Appends `entry` (`ID /* comment *\/`) to the list `key` of object `id`. */
function appendToList(text: string, id: string, key: string, entry: string): string {
  const object = findObject(text, id)
  if (!object) throw new Error(`project.pbxproj: no object ${id}.`)
  const objectText = text.slice(object.start, object.end)
  const list = new RegExp(`^([\\t ]*)${escapeRegExp(key)} = \\(\\n?`, 'm').exec(objectText)
  if (list) {
    const close = objectText.indexOf(');', list.index + list[0].length)
    const lineStart = objectText.lastIndexOf('\n', close) + 1
    const at = object.start + lineStart
    return `${text.slice(0, at)}${list[1]}\t${entry},\n${text.slice(at)}`
  }
  // No such list yet: add it before the object's closing brace.
  const indent = /\n([\t ]*)isa = /.exec(objectText)?.[1] ?? '\t\t\t'
  const at = object.end - 2
  const closeLine = text.lastIndexOf('\n', at) + 1
  return `${text.slice(0, closeLine)}${indent}${key} = (\n${indent}\t${entry},\n${indent});\n${text.slice(closeLine)}`
}

/** Adds objects to a `/* Begin <section> section *\/`, creating the section in alphabetical order when it is missing. */
function addToSection(text: string, section: string, objects: string): string {
  const end = text.indexOf(`/* End ${section} section */`)
  if (end !== -1) return `${text.slice(0, end)}${objects}${text.slice(end)}`
  const block = `/* Begin ${section} section */\n${objects}/* End ${section} section */\n\n`
  for (const match of text.matchAll(/^\/\* Begin (\w+) section \*\/$/gm)) {
    if (match[1]! > section) return `${text.slice(0, match.index)}${block}${text.slice(match.index)}`
  }
  const objectsEnd = text.search(/^\t\};\n\trootObject = /m)
  if (objectsEnd === -1) throw new Error('project.pbxproj: no rootObject.')
  return `${text.slice(0, objectsEnd)}\n${block.trimEnd()}\n${text.slice(objectsEnd)}`
}

export interface PbxTarget {
  id: string
  name: string
  productType?: string
  /** The `.app` file reference. */
  productReference?: string
  /** Build settings per configuration name. */
  configurations: { name: string, settings: string }[]
  buildPhases: string[]
  dependencies: string[]
}

function rootProject(text: string): PbxObject {
  const root = /^\trootObject = (\w+)/m.exec(text)?.[1]
  const project = root ? findObject(text, root) : undefined
  if (!project) throw new Error('project.pbxproj: no root project object.')
  return project
}

/** The native targets of the project, in the project's order. */
export function readTargets(text: string): PbxTarget[] {
  const project = rootProject(text)
  return readList(project.body, 'targets').flatMap((id) => {
    const target = findObject(text, id)
    if (!target || isa(target) !== 'PBXNativeTarget') return []
    const list = findObject(text, readValue(target.body, 'buildConfigurationList') ?? '')
    const configurations = (list ? readList(list.body, 'buildConfigurations') : []).flatMap((configId) => {
      const config = findObject(text, configId)
      return config ? [{ name: readValue(config.body, 'name') ?? configId, settings: config.body }] : []
    })
    return [{
      id,
      name: readValue(target.body, 'name') ?? id,
      productType: readValue(target.body, 'productType'),
      productReference: readValue(target.body, 'productReference'),
      configurations,
      buildPhases: readList(target.body, 'buildPhases'),
      dependencies: readList(target.body, 'dependencies'),
    }]
  })
}

const isWatchTarget = (target: PbxTarget) => target.configurations.some(config => readValue(config.settings, 'SDKROOT') === 'watchos'
  || readValue(config.settings, 'INFOPLIST_KEY_WKCompanionAppBundleIdentifier') !== undefined)

/** watchOS app targets of the project. */
export function readWatchTargets(text: string): PbxTarget[] {
  return readTargets(text).filter(target => target.productType === 'com.apple.product-type.application' && isWatchTarget(target))
}

/** The iPhone app target: Capacitor's `App`, else the first non-watch application target. */
export function readAppTarget(text: string): PbxTarget | undefined {
  const apps = readTargets(text).filter(target => target.productType === 'com.apple.product-type.application' && !isWatchTarget(target))
  return apps.find(target => target.name === 'App') ?? apps[0]
}

/** Whether `app` copies the product of `watch` into `$(CONTENTS_FOLDER_PATH)/Watch`. */
export function embedsWatchApp(text: string, app: PbxTarget, watch: PbxTarget): boolean {
  return app.buildPhases.some((phaseId) => {
    const phase = findObject(text, phaseId)
    if (!phase || isa(phase) !== 'PBXCopyFilesBuildPhase') return false
    if (!readValue(phase.body, 'dstPath')?.includes('/Watch')) return false
    return readList(phase.body, 'files').some((fileId) => {
      const file = findObject(text, fileId)
      return !!file && readValue(file.body, 'fileRef') === watch.productReference
    })
  })
}

/** Whether `app` has a target dependency on `watch`. */
export function dependsOn(text: string, app: PbxTarget, watch: PbxTarget): boolean {
  return app.dependencies.some((id) => {
    const dependency = findObject(text, id)
    return !!dependency && readValue(dependency.body, 'target') === watch.id
  })
}

export interface WatchTargetOptions {
  /** Target, folder and product name, e.g. `MyAppWatch`. */
  name: string
  /** The watch app's bundle id, e.g. `com.example.app.watchkitapp`. */
  bundleId: string
  /** The iPhone app's bundle id (`WKCompanionAppBundleIdentifier`). */
  companionBundleId: string
  /** The sources folder, relative to the project's folder (`ios/App`). Default: `name`. */
  path?: string
  /** `CFBundleDisplayName` of the watch app. */
  displayName: string
  /** Default `10.0`. */
  deploymentTarget?: string
}

export interface WatchTargetResult {
  contents: string
  changed: boolean
  /** The watch target the project already has, when it was left alone. */
  existing?: string
}

/**
 * Adds a single-target watchOS SwiftUI app (`com.apple.product-type.application`, `SDKROOT = watchos`) whose sources
 * are the folder `path` (a file-system synchronized group, so files added in Xcode or on disk need no
 * project edits), embeds it in the iPhone app ("Embed Watch Content") and makes the iPhone app depend on it.
 * Idempotent: a project with a watch target is returned unchanged.
 */
export function addWatchTarget(text: string, options: WatchTargetOptions): WatchTargetResult {
  const existing = readWatchTargets(text)[0]
  if (existing) return { contents: text, changed: false, existing: existing.name }
  const { name, bundleId, companionBundleId, displayName } = options
  const deploymentTarget = options.deploymentTarget ?? '10.0'
  if (readTargets(text).some(target => target.name === name)) throw new Error(`project.pbxproj already has a target named "${name}".`)
  const app = readAppTarget(text)
  if (!app) throw new Error('project.pbxproj has no iPhone app target.')
  const project = rootProject(text)
  const mainGroup = readValue(project.body, 'mainGroup')
  const productsGroup = readValue(project.body, 'productRefGroup')
  if (!mainGroup || !productsGroup) throw new Error('project.pbxproj: the project has no main or products group.')
  const configNames = app.configurations.length ? app.configurations.map(config => config.name) : ['Debug', 'Release']

  const used = new Set<string>()
  const newId = () => {
    let id: string
    do id = randomBytes(12).toString('hex').toUpperCase()
    while (used.has(id) || text.includes(id))
    used.add(id)
    return id
  }
  const ids = {
    product: newId(),
    group: newId(),
    target: newId(),
    sources: newId(),
    frameworks: newId(),
    resources: newId(),
    configList: newId(),
    configs: configNames.map(() => newId()),
    embedFile: newId(),
    embedPhase: newId(),
    proxy: newId(),
    dependency: newId(),
  }
  const product = `${name}.app`
  const settings = (configName: string) => [
    'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;',
    'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;',
    'CODE_SIGN_STYLE = Automatic;',
    'CURRENT_PROJECT_VERSION = 1;',
    'ENABLE_PREVIEWS = YES;',
    'GENERATE_INFOPLIST_FILE = YES;',
    `INFOPLIST_KEY_CFBundleDisplayName = ${quote(displayName)};`,
    'INFOPLIST_KEY_UISupportedInterfaceOrientations = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown";',
    `INFOPLIST_KEY_WKCompanionAppBundleIdentifier = ${quote(companionBundleId)};`,
    'LD_RUNPATH_SEARCH_PATHS = (\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t\t"@executable_path/Frameworks",\n\t\t\t\t);',
    'MARKETING_VERSION = 1.0;',
    `PRODUCT_BUNDLE_IDENTIFIER = ${quote(bundleId)};`,
    'PRODUCT_NAME = "$(TARGET_NAME)";',
    'SDKROOT = watchos;',
    'SKIP_INSTALL = YES;',
    ...(configName === 'Debug' ? ['SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;'] : []),
    'SWIFT_EMIT_LOC_STRINGS = YES;',
    'SWIFT_VERSION = 5.0;',
    'TARGETED_DEVICE_FAMILY = 4;',
    `WATCHOS_DEPLOYMENT_TARGET = ${deploymentTarget};`,
  ].map(line => `\t\t\t\t${line}\n`).join('')

  let out = text
  out = addToSection(out, 'PBXBuildFile',
    `\t\t${ids.embedFile} /* ${product} in Embed Watch Content */ = {isa = PBXBuildFile; fileRef = ${ids.product} /* ${product} */; settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; };\n`)
  out = addToSection(out, 'PBXContainerItemProxy', [
    `\t\t${ids.proxy} /* PBXContainerItemProxy */ = {`,
    '\t\t\tisa = PBXContainerItemProxy;',
    `\t\t\tcontainerPortal = ${project.id} /* Project object */;`,
    '\t\t\tproxyType = 1;',
    `\t\t\tremoteGlobalIDString = ${ids.target};`,
    `\t\t\tremoteInfo = ${name};`,
    '\t\t};\n',
  ].join('\n'))
  out = addToSection(out, 'PBXCopyFilesBuildPhase', [
    `\t\t${ids.embedPhase} /* Embed Watch Content */ = {`,
    '\t\t\tisa = PBXCopyFilesBuildPhase;',
    '\t\t\tbuildActionMask = 2147483647;',
    '\t\t\tdstPath = "$(CONTENTS_FOLDER_PATH)/Watch";',
    '\t\t\tdstSubfolderSpec = 16;',
    '\t\t\tfiles = (',
    `\t\t\t\t${ids.embedFile} /* ${product} in Embed Watch Content */,`,
    '\t\t\t);',
    '\t\t\tname = "Embed Watch Content";',
    '\t\t\trunOnlyForDeploymentPostprocessing = 0;',
    '\t\t};\n',
  ].join('\n'))
  out = addToSection(out, 'PBXFileReference',
    `\t\t${ids.product} /* ${product} */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${product}; sourceTree = BUILT_PRODUCTS_DIR; };\n`)
  out = addToSection(out, 'PBXFileSystemSynchronizedRootGroup', [
    `\t\t${ids.group} /* ${name} */ = {`,
    '\t\t\tisa = PBXFileSystemSynchronizedRootGroup;',
    ...(options.path && options.path !== name ? [`\t\t\tname = ${name};`] : []),
    `\t\t\tpath = ${quote(options.path ?? name)};`,
    '\t\t\tsourceTree = "<group>";',
    '\t\t};\n',
  ].join('\n'))
  const phase = (id: string, kind: string) => [
    `\t\t${id} /* ${kind} */ = {`,
    `\t\t\tisa = PBX${kind}BuildPhase;`,
    '\t\t\tbuildActionMask = 2147483647;',
    '\t\t\tfiles = (',
    '\t\t\t);',
    '\t\t\trunOnlyForDeploymentPostprocessing = 0;',
    '\t\t};\n',
  ].join('\n')
  out = addToSection(out, 'PBXFrameworksBuildPhase', phase(ids.frameworks, 'Frameworks'))
  out = addToSection(out, 'PBXNativeTarget', [
    `\t\t${ids.target} /* ${name} */ = {`,
    '\t\t\tisa = PBXNativeTarget;',
    `\t\t\tbuildConfigurationList = ${ids.configList} /* Build configuration list for PBXNativeTarget "${name}" */;`,
    '\t\t\tbuildPhases = (',
    `\t\t\t\t${ids.sources} /* Sources */,`,
    `\t\t\t\t${ids.frameworks} /* Frameworks */,`,
    `\t\t\t\t${ids.resources} /* Resources */,`,
    '\t\t\t);',
    '\t\t\tbuildRules = (',
    '\t\t\t);',
    '\t\t\tdependencies = (',
    '\t\t\t);',
    '\t\t\tfileSystemSynchronizedGroups = (',
    `\t\t\t\t${ids.group} /* ${name} */,`,
    '\t\t\t);',
    `\t\t\tname = ${name};`,
    '\t\t\tpackageProductDependencies = (',
    '\t\t\t);',
    `\t\t\tproductName = ${name};`,
    `\t\t\tproductReference = ${ids.product} /* ${product} */;`,
    '\t\t\tproductType = "com.apple.product-type.application";',
    '\t\t};\n',
  ].join('\n'))
  out = addToSection(out, 'PBXResourcesBuildPhase', phase(ids.resources, 'Resources'))
  out = addToSection(out, 'PBXSourcesBuildPhase', phase(ids.sources, 'Sources'))
  out = addToSection(out, 'PBXTargetDependency', [
    `\t\t${ids.dependency} /* PBXTargetDependency */ = {`,
    '\t\t\tisa = PBXTargetDependency;',
    `\t\t\ttarget = ${ids.target} /* ${name} */;`,
    `\t\t\ttargetProxy = ${ids.proxy} /* PBXContainerItemProxy */;`,
    '\t\t};\n',
  ].join('\n'))
  out = addToSection(out, 'XCBuildConfiguration', configNames.map((configName, index) => [
    `\t\t${ids.configs[index]} /* ${configName} */ = {`,
    '\t\t\tisa = XCBuildConfiguration;',
    '\t\t\tbuildSettings = {',
    `${settings(configName)}\t\t\t};`,
    `\t\t\tname = ${quote(configName)};`,
    '\t\t};\n',
  ].join('\n')).join(''))
  out = addToSection(out, 'XCConfigurationList', [
    `\t\t${ids.configList} /* Build configuration list for PBXNativeTarget "${name}" */ = {`,
    '\t\t\tisa = XCConfigurationList;',
    '\t\t\tbuildConfigurations = (',
    ...configNames.map((configName, index) => `\t\t\t\t${ids.configs[index]} /* ${configName} */,`),
    '\t\t\t);',
    '\t\t\tdefaultConfigurationIsVisible = 0;',
    `\t\t\tdefaultConfigurationName = ${quote(configNames.includes('Release') ? 'Release' : configNames.at(-1)!)};`,
    '\t\t};\n',
  ].join('\n'))

  out = appendToList(out, mainGroup, 'children', `${ids.group} /* ${name} */`)
  out = appendToList(out, productsGroup, 'children', `${ids.product} /* ${product} */`)
  out = appendToList(out, project.id, 'targets', `${ids.target} /* ${name} */`)
  out = appendToList(out, app.id, 'buildPhases', `${ids.embedPhase} /* Embed Watch Content */`)
  out = appendToList(out, app.id, 'dependencies', `${ids.dependency} /* PBXTargetDependency */`)
  out = out.replace(/^(\t+)TargetAttributes = \{\n/m, (line, indent: string) =>
    `${line}${indent}\t${ids.target} = {\n${indent}\t\tCreatedOnToolsVersion = 16.0;\n${indent}\t};\n`)
  // File-system synchronized groups need the Xcode 16 project format.
  out = out.replace(/^\tobjectVersion = (\d+);/m, (line, version: string) => Number(version) < 70 ? '\tobjectVersion = 70;' : line)
  return { contents: out, changed: true }
}

/** Every object id with its `isa`, for tests and diagnostics. */
export function listObjects(text: string): { id: string, isa?: string }[] {
  return allObjects(text).map(object => ({ id: object.id, isa: isa(object) }))
}

/** The body of object `id`, for tests and diagnostics. */
export function objectBody(text: string, id: string): string | undefined {
  return findObject(text, id)?.body
}
