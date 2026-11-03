// AndroidManifest.xml edits as text, like the Info.plist ones: only the launcher activity gets intent filters added.

const ATTRIBUTE = (name: string) => new RegExp(`android:${name}\\s*=\\s*"([^"]*)"`)

/** Resolves `@string/name` from `strings.xml` contents. */
export function readAndroidStrings(xml: string): Record<string, string> {
  const strings: Record<string, string> = {}
  for (const match of xml.matchAll(/<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)) strings[match[1]!] = match[2]!.trim()
  return strings
}

function resolve(value: string, strings: Record<string, string>): string {
  const reference = /^@string\/(.+)$/.exec(value)
  return reference ? (strings[reference[1]!] ?? value) : value
}

export interface ManifestLinks {
  /** Custom schemes with a VIEW intent filter. */
  schemes: string[]
  /** `https` hosts with a VIEW intent filter. */
  hosts: string[]
}

/** The schemes and hosts the manifest's VIEW intent filters accept (`@string/...` resolved from `strings`). */
export function readManifestLinks(xml: string, strings: Record<string, string> = {}): ManifestLinks {
  const schemes = new Set<string>()
  const hosts = new Set<string>()
  for (const filter of xml.matchAll(/<intent-filter\b[^>]*>([\s\S]*?)<\/intent-filter>/g)) {
    const body = filter[1]!
    if (!body.includes('android.intent.action.VIEW')) continue
    for (const data of body.matchAll(/<data\b[^>]*?\/?>/g)) {
      const scheme = ATTRIBUTE('scheme').exec(data[0])?.[1]
      const host = ATTRIBUTE('host').exec(data[0])?.[1]
      if (scheme) {
        const resolved = resolve(scheme, strings)
        if (resolved === 'https' && host) hosts.add(resolve(host, strings).toLowerCase())
        else if (resolved !== 'https' && resolved !== 'http') schemes.add(resolved)
      }
    }
  }
  return { schemes: [...schemes], hosts: [...hosts] }
}

/** The launcher activity: the one with the MAIN / LAUNCHER intent filter (Capacitor's `.MainActivity`). */
function findLauncherActivity(xml: string): { start: number, closeStart: number } | undefined {
  for (const open of xml.matchAll(/<activity\b[^>]*>/g)) {
    if (open[0].endsWith('/>')) continue
    const closeStart = xml.indexOf('</activity>', open.index)
    if (closeStart === -1) return undefined
    if (xml.slice(open.index, closeStart).includes('android.intent.category.LAUNCHER')) return { start: open.index, closeStart }
  }
  return undefined
}

/**
 * Adds a VIEW intent filter for every custom scheme (the OAuth redirect, deep links) and a verified app-link filter for
 * every `https` host to the launcher activity. Idempotent: schemes and hosts the manifest already accepts are skipped.
 * Android schemes are case-sensitive, so they are compared as given (the module passes them lowercase).
 */
export function patchAndroidManifest(xml: string, options: { schemes: string[], hosts?: string[], strings?: Record<string, string> }): { contents: string, changed: boolean, added: string[] } {
  const existing = readManifestLinks(xml, options.strings)
  const schemes = [...new Set(options.schemes)].filter(scheme => !existing.schemes.includes(scheme))
  const hosts = [...new Set((options.hosts ?? []).map(host => host.toLowerCase()))].filter(host => !existing.hosts.includes(host))
  if (!schemes.length && !hosts.length) return { contents: xml, changed: false, added: [] }

  const activity = findLauncherActivity(xml)
  if (!activity) throw new Error('No launcher activity (MAIN / LAUNCHER intent filter) in AndroidManifest.xml.')

  const nl = xml.includes('\r\n') ? '\r\n' : '\n'
  const lineStart = xml.lastIndexOf('\n', activity.closeStart - 1) + 1
  const activityIndent = /^[ \t]*/.exec(xml.slice(xml.lastIndexOf('\n', activity.start - 1) + 1))![0]
  const unit = activityIndent.length >= 4 && !activityIndent.includes('\t') ? '    ' : (activityIndent.includes('\t') ? '\t' : '    ')
  const i1 = activityIndent + unit
  const i2 = i1 + unit
  const filter = (data: string, verify = false) => [
    `${i1}<intent-filter${verify ? ' android:autoVerify="true"' : ''}>`,
    `${i2}<action android:name="android.intent.action.VIEW" />`,
    `${i2}<category android:name="android.intent.category.DEFAULT" />`,
    `${i2}<category android:name="android.intent.category.BROWSABLE" />`,
    `${i2}${data}`,
    `${i1}</intent-filter>`,
  ].join(nl)

  const blocks = [
    ...schemes.map(scheme => filter(`<data android:scheme="${scheme}" />`)),
    ...hosts.map(host => filter(`<data android:scheme="https" android:host="${host}" />`, true)),
  ]
  const before = /^[ \t]*$/.test(xml.slice(lineStart, activity.closeStart)) ? lineStart : activity.closeStart
  const prefix = before === activity.closeStart ? nl : ''
  const contents = `${xml.slice(0, before)}${prefix}${blocks.join(nl)}${nl}${xml.slice(before)}`
  return { contents, changed: true, added: [...schemes.map(scheme => `scheme ${scheme}`), ...hosts.map(host => `app link ${host}`)] }
}
