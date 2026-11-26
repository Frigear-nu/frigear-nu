import type { PackageJson } from 'pkg-types'
import { repoSource } from '../utils/template.ts'

/** What `platform init <target>` runs in an app: the app's own `script` when it has it, else the `bin` command. */
export interface PlatformTarget {
  description?: string
  /** Other names for the target, e.g. `watchos` for `apple-watch`. */
  aliases?: string[]
  /** A script of the app's package.json, run with the workspace's package manager. */
  script?: string
  /** A binary of the app's dependencies and its leading arguments, e.g. `['frigear-mobile', 'native']`. */
  bin?: string[]
  /** Arguments appended to the script or the binary. */
  args?: string[]
}

export interface NextStepsContext {
  /** The app's folder name, e.g. `mobile`. */
  appName: string
  /** The app's path relative to the workspace root, e.g. `apps/mobile`. */
  appDir: string
  /** The app's package name, e.g. `@workspace/mobile`. */
  packageName: string
  root: string
  /** Whether an app of the workspace runs `@frigear-nu/oauth-server`, so the new app can sign in there. */
  hasOAuthServer: boolean
}

export interface PlatformDefinition {
  /** `mobile`, `display`, ... */
  name: string
  description?: string
  /** A template name (`web`, `mobile`, ... or a project's own) or a giget source. */
  template?: string
  /** Folder name of the app when none is given; defaults to `name`. */
  defaultAppName?: string
  /**
   * Root package.json scripts added for each app of the platform. In keys and values `<name>` is the app's folder name
   * and `<dir>` its path from the root (`./apps/mobile`). Existing scripts are never overwritten.
   */
  scripts?: Record<string, string>
  /** Printed after the app was added; `<name>`, `<dir>` and `<package>` are replaced in string steps. */
  nextSteps?: string[] | ((context: NextStepsContext) => string[])
  /** What `platform init <target>` can do for apps of this platform. */
  targets?: Record<string, PlatformTarget>
  /** Recognises an app of this platform that has no `frigear.platform` field in its package.json. */
  detect?: (pkg: PackageJson) => boolean
}

export const definePlatform = (definition: PlatformDefinition): PlatformDefinition => definition

/** App templates, as paths in the frigear-nu repository. */
export const APP_TEMPLATES = {
  'web': '.starters/workspace/apps/web',
  'web-standalone': '.starters/mobile-standalone/apps/web',
  'mobile': '.starters/mobile/apps/mobile',
  'desktop': '.starters/desktop/apps/desktop',
} as const

export type AppTemplate = keyof typeof APP_TEMPLATES

const dependsOn = (pkg: PackageJson, name: string) => !!(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name])

const clientSteps = (context: NextStepsContext, init: string, defaultName: string) => [
  // A second app from the same template starts with the first one's app id and OAuth client id.
  ...context.appName === defaultName ? [] : [`  give it its own app id, name and client id in ${context.appDir}/identity.ts`],
  context.hasOAuthServer
    ? `  register the client: import ${context.packageName}/identity in the OAuth server app's nuxt.config.ts and add it to oauthServer.clients (as in the multi-platform starter)`
    : `  set NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER (and _API_BASE) in ${context.appDir}/.env`,
  `  pnpm ${context.appName}:${init}`,
]

const web = definePlatform({
  name: 'web',
  description: 'A Nuxt web app: users, auth, account and admin',
  template: 'web',
  scripts: {
    'dev:<name>': 'pnpm --filter <dir> dev',
    'db:generate': 'pnpm --filter <dir> db:generate',
    'db:migrate': 'pnpm --filter <dir> db:migrate',
  },
  nextSteps: ['  put your email in NUXT_ACL_ADMINS in <dir>/.env'],
  detect: pkg => dependsOn(pkg, 'nuxt') && !dependsOn(pkg, '@frigear-nu/mobile') && !dependsOn(pkg, '@frigear-nu/desktop'),
})

/** The built-in platforms. A project adds its own, or overrides these, under `frigear.platforms` in the root package.json. */
export const BUILTIN_PLATFORMS: Record<string, PlatformDefinition> = {
  'web': web,
  'web-standalone': definePlatform({
    ...web,
    name: 'web-standalone',
    description: 'The web app with an OAuth server and API for the mobile and desktop apps',
    template: 'web-standalone',
    defaultAppName: 'web',
    detect: pkg => web.detect!(pkg) && dependsOn(pkg, '@frigear-nu/oauth-server'),
  }),
  'mobile': definePlatform({
    name: 'mobile',
    description: 'A Capacitor app on @frigear-nu/mobile (iOS, Android, Apple Watch)',
    template: 'mobile',
    scripts: {
      'dev:<name>': 'pnpm --filter <dir> dev',
      '<name>:native': 'pnpm --filter <dir> run native',
      '<name>:doctor': 'pnpm --filter <dir> run doctor',
      '<name>:watch': 'pnpm --filter <dir> run watch',
      '<name>:sync': 'pnpm --filter <dir> run cap:sync',
      '<name>:ios': 'pnpm --filter <dir> run ios:run',
      '<name>:ios:device': 'pnpm --filter <dir> run ios:device',
      '<name>:android': 'pnpm --filter <dir> run android:run',
    },
    nextSteps: context => clientSteps(context, 'native', 'mobile'),
    targets: {
      'ios': { description: 'The Xcode project (ios/)', script: 'native', bin: ['frigear-mobile', 'native'], args: ['--platform', 'ios'] },
      'android': { description: 'The Android Studio project (android/)', script: 'native', bin: ['frigear-mobile', 'native'], args: ['--platform', 'android'] },
      'apple-watch': { description: 'A watchOS companion app in the iOS project', aliases: ['watchos', 'watch'], script: 'watch', bin: ['frigear-mobile', 'watch'] },
    },
    detect: pkg => dependsOn(pkg, '@frigear-nu/mobile'),
  }),
  'desktop': definePlatform({
    name: 'desktop',
    description: 'A Tauri app on @frigear-nu/desktop (macOS, Windows, Linux)',
    template: 'desktop',
    scripts: {
      'dev:<name>': 'pnpm --filter <dir> dev',
      '<name>:setup': 'pnpm --filter <dir> run setup',
      '<name>:doctor': 'pnpm --filter <dir> run doctor',
      '<name>:init': 'pnpm --filter <dir> run native',
      '<name>:sync': 'pnpm --filter <dir> run native:sync',
      '<name>:dev': 'pnpm --filter <dir> run native:dev',
      '<name>:build': 'pnpm --filter <dir> run native:build',
      '<name>:sidecar': 'pnpm --filter <dir> run sidecar',
    },
    nextSteps: context => clientSteps(context, 'setup', 'desktop'),
    targets: {
      tauri: { description: 'The Tauri project (src-tauri/)', aliases: ['desktop'], script: 'native', bin: ['frigear-desktop', 'init'] },
    },
    detect: pkg => dependsOn(pkg, '@frigear-nu/desktop'),
  }),
}

/** A platform or template list from a root package.json `frigear` field, or `{}` when it is missing or malformed. */
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const strings = (value: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))

/** A target from JSON: only the known string / string-array fields are taken. */
const jsonTarget = (value: unknown): PlatformTarget => {
  const raw = record(value)
  const list = (key: string) => Array.isArray(raw[key]) ? (raw[key] as unknown[]).filter(item => typeof item === 'string') as string[] : undefined
  return {
    description: typeof raw.description === 'string' ? raw.description : undefined,
    script: typeof raw.script === 'string' ? raw.script : undefined,
    bin: list('bin'),
    args: list('args'),
    aliases: list('aliases'),
  }
}

/** A platform from `frigear.platforms.<name>`, merged over the built-in of the same name. */
const jsonPlatform = (name: string, value: unknown, base?: PlatformDefinition): PlatformDefinition => {
  const raw = record(value)
  const nextSteps = Array.isArray(raw.nextSteps) ? raw.nextSteps.filter(step => typeof step === 'string') as string[] : undefined
  const targets = Object.fromEntries(Object.entries(record(raw.targets)).map(([key, target]) => [key, jsonTarget(target)]))
  return {
    ...base,
    name,
    description: typeof raw.description === 'string' ? raw.description : base?.description,
    template: typeof raw.template === 'string' ? raw.template : base?.template,
    defaultAppName: typeof raw.defaultAppName === 'string' ? raw.defaultAppName : base?.defaultAppName,
    scripts: raw.scripts ? strings(raw.scripts) : base?.scripts,
    nextSteps: nextSteps ?? base?.nextSteps,
    targets: { ...base?.targets, ...targets },
  }
}

export interface PlatformRegistry {
  platforms: Record<string, PlatformDefinition>
  /** Template names and their giget sources. */
  templates: Record<string, string>
}

/** The built-ins plus a project's own platforms and templates from `frigear` in its root package.json. */
export const platformRegistry = (rootPkg?: PackageJson, ref = 'main'): PlatformRegistry => {
  const frigear = record(rootPkg?.frigear)
  const templates = {
    ...Object.fromEntries(Object.entries(APP_TEMPLATES).map(([name, path]) => [name, repoSource(path, ref)])),
    ...strings(frigear.templates),
  }
  const platforms = { ...BUILTIN_PLATFORMS }
  for (const [name, value] of Object.entries(record(frigear.platforms)))
    platforms[name] = jsonPlatform(name, value, BUILTIN_PLATFORMS[name])
  return { platforms, templates }
}

/** Whether a `--template` value is a giget source rather than a template name. */
export const isTemplateSource = (value: string) => value.includes(':') || value.includes('/')

/** The target of a platform by name or alias. */
export const findTarget = (platform: PlatformDefinition, name: string) => {
  const key = name.toLowerCase()
  const entry = Object.entries(platform.targets ?? {}).find(([id, target]) => id === key || target.aliases?.includes(key))
  return entry ? { id: entry[0], target: entry[1] } : undefined
}
