// Info.plist edits as text, so a patched file keeps its comments, order and formatting (Xcode rewrites it anyway).
// Only the top-level dictionary is touched.

interface Token {
  kind: 'open' | 'close' | 'empty' | 'key' | 'scalar' | 'comment'
  tag: string
  start: number
  end: number
  text?: string
}

// `<string/>` (an empty string) is a scalar too: unmatched, it would shift every later key onto the wrong value.
const TOKEN = /<!--[\s\S]*?-->|<key>([\s\S]*?)<\/key>|<(string|integer|real|date|data)>([\s\S]*?)<\/\2>|<(dict|array)\s*\/>|<(true|false)\s*\/>|<(\/?)(dict|array|plist)\b[^>]*>|<(string|data|key)\s*\/>/g

function tokenize(xml: string): Token[] {
  const tokens: Token[] = []
  for (const match of xml.matchAll(TOKEN)) {
    const start = match.index
    const end = start + match[0].length
    if (match[0].startsWith('<!--')) tokens.push({ kind: 'comment', tag: '', start, end })
    else if (match[1] !== undefined) tokens.push({ kind: 'key', tag: 'key', start, end, text: decode(match[1]) })
    else if (match[2]) tokens.push({ kind: 'scalar', tag: match[2], start, end, text: decode(match[3] ?? '') })
    else if (match[4]) tokens.push({ kind: 'empty', tag: match[4], start, end })
    else if (match[5]) tokens.push({ kind: 'scalar', tag: match[5], start, end, text: match[5] })
    else if (match[8] === 'key') tokens.push({ kind: 'key', tag: 'key', start, end, text: '' })
    else if (match[8]) tokens.push({ kind: 'scalar', tag: match[8], start, end, text: '' })
    else tokens.push({ kind: match[6] ? 'close' : 'open', tag: match[7]!, start, end })
  }
  return tokens
}

const decode = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&')
const encode = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface PlistEntry {
  key: string
  /** Offsets of the `<key>` element. */
  keyStart: number
  /** Offsets of the value element. */
  valueStart: number
  valueEnd: number
  /** Tokens of the value. */
  tokens: Token[]
}

/** The entries of a dictionary whose `<dict>` token is `tokens[openIndex]`, and the offset of its `</dict>`. */
function readDict(tokens: Token[], openIndex: number): { entries: PlistEntry[], closeStart: number } {
  const entries: PlistEntry[] = []
  let index = openIndex + 1
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.kind === 'comment') {
      index++
      continue
    }
    if (token.kind === 'close' && token.tag === 'dict') return { entries, closeStart: token.start }
    if (token.kind !== 'key') throw new Error(`Unexpected <${token.tag}> in a <dict> at offset ${token.start}.`)
    let valueIndex = index + 1
    while (tokens[valueIndex]?.kind === 'comment') valueIndex++
    const value = tokens[valueIndex]
    if (!value) throw new Error(`The key "${token.text}" has no value.`)
    let endIndex = valueIndex
    if (value.kind === 'open') {
      let depth = 0
      for (; endIndex < tokens.length; endIndex++) {
        const t = tokens[endIndex]!
        if (t.kind === 'open') depth++
        else if (t.kind === 'close' && --depth === 0) break
      }
    }
    const last = tokens[endIndex]
    if (!last) throw new Error(`The value of "${token.text}" is not closed.`)
    entries.push({ key: token.text!, keyStart: token.start, valueStart: value.start, valueEnd: last.end, tokens: tokens.slice(valueIndex, endIndex + 1) })
    index = endIndex + 1
  }
  throw new Error('The <dict> is not closed.')
}

function topLevel(xml: string) {
  const tokens = tokenize(xml)
  const plist = tokens.findIndex(token => token.kind === 'open' && token.tag === 'plist')
  const open = tokens.findIndex((token, index) => index > plist && token.kind === 'open' && token.tag === 'dict')
  if (plist === -1 || open === -1) throw new Error('Not a property list with a top-level <dict>.')
  return { tokens, open, ...readDict(tokens, open) }
}

/** The URL schemes in `CFBundleURLTypes`, with `$(VARIABLE)`s resolved from `variables` (unknown ones kept as is). */
export function readPlistSchemes(xml: string, variables: Record<string, string> = {}): string[] {
  const { entries } = topLevel(xml)
  const types = entries.find(entry => entry.key === 'CFBundleURLTypes')
  if (!types) return []
  const schemes: string[] = []
  const tokens = types.tokens
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.kind !== 'key' || tokens[index]!.text !== 'CFBundleURLSchemes' || tokens[index + 1]?.kind !== 'open') continue
    for (let inner = index + 2; inner < tokens.length && !(tokens[inner]!.kind === 'close' && tokens[inner]!.tag === 'array'); inner++) {
      const token = tokens[inner]!
      if (token.kind === 'scalar' && token.tag === 'string') {
        schemes.push(token.text!.replace(/\$\((\w+)\)/g, (whole, name: string) => variables[name] ?? whole))
      }
    }
  }
  return schemes
}

/** Whether the top-level `NSAppTransportSecurity` allows local networking. */
export function readPlistLocalNetworking(xml: string): boolean {
  const ats = topLevel(xml).entries.find(entry => entry.key === 'NSAppTransportSecurity')
  if (!ats) return false
  const index = ats.tokens.findIndex(token => token.kind === 'key' && token.text === 'NSAllowsLocalNetworking')
  return index !== -1 && ats.tokens[index + 1]?.text === 'true'
}

export interface PlistPatchOptions {
  /** URL schemes to register (compared case-insensitively). */
  schemes: string[]
  /** Resolves `$(PRODUCT_BUNDLE_IDENTIFIER)` and friends in existing entries. */
  variables?: Record<string, string>
  /** Adds `NSAppTransportSecurity` → `NSAllowsLocalNetworking` and a local network usage description. */
  allowLocalNetworking?: boolean
}

/**
 * Registers the URL schemes in `CFBundleURLTypes` and, optionally, local networking (plain http to the LAN, for
 * development servers). Idempotent: an entry that exists is left as it is, so running it again changes nothing.
 */
export function patchInfoPlist(xml: string, options: PlistPatchOptions): { contents: string, changed: boolean, added: string[] } {
  const { entries, closeStart } = topLevel(xml)
  // The indent most top-level keys use (Capacitor's template mixes in a line with spaces).
  const indents = entries.map(entry => lineIndent(xml, entry.keyStart)).filter(Boolean)
  const counts = new Map<string, number>()
  for (const indent of indents) counts.set(indent, (counts.get(indent) ?? 0) + 1)
  const unit = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '\t'
  const nl = xml.includes('\r\n') ? '\r\n' : '\n'
  const ind = (depth: number) => unit.repeat(depth)
  const edits: { at: number, text: string, remove?: number }[] = []
  const added: string[] = []

  const existing = new Set(readPlistSchemes(xml, options.variables).map(scheme => scheme.toLowerCase()))
  const missing = [...new Set(options.schemes.map(scheme => scheme.toLowerCase()))].filter(scheme => !existing.has(scheme))
  const urlType = (scheme: string, depth: number) => [
    `${ind(depth)}<dict>`,
    `${ind(depth + 1)}<key>CFBundleURLName</key>`,
    `${ind(depth + 1)}<string>${encode(scheme)}</string>`,
    `${ind(depth + 1)}<key>CFBundleURLSchemes</key>`,
    `${ind(depth + 1)}<array>`,
    `${ind(depth + 2)}<string>${encode(scheme)}</string>`,
    `${ind(depth + 1)}</array>`,
    `${ind(depth)}</dict>`,
  ].join(nl)

  if (missing.length) {
    added.push(...missing.map(scheme => `CFBundleURLSchemes: ${scheme}`))
    const types = entries.find(entry => entry.key === 'CFBundleURLTypes')
    if (types && types.tokens[0]?.kind === 'open') {
      const closeArray = types.tokens[types.tokens.length - 1]!
      const before = lineStart(xml, closeArray.start)
      edits.push({ at: before, text: `${missing.map(scheme => urlType(scheme, 2)).join(nl)}${nl}` })
    }
    else if (types) {
      // `<array/>`: replace it.
      edits.push({ at: types.valueStart, text: `<array>${nl}${missing.map(scheme => urlType(scheme, 2)).join(nl)}${nl}${ind(1)}</array>`, remove: types.valueEnd - types.valueStart })
    }
    else {
      edits.push({
        at: lineStart(xml, closeStart),
        text: `${ind(1)}<key>CFBundleURLTypes</key>${nl}${ind(1)}<array>${nl}${missing.map(scheme => urlType(scheme, 2)).join(nl)}${nl}${ind(1)}</array>${nl}`,
      })
    }
  }

  if (options.allowLocalNetworking) {
    const ats = entries.find(entry => entry.key === 'NSAppTransportSecurity')
    if (!ats) {
      added.push('NSAppTransportSecurity: NSAllowsLocalNetworking')
      edits.push({
        at: lineStart(xml, closeStart),
        text: `${ind(1)}<key>NSAppTransportSecurity</key>${nl}${ind(1)}<dict>${nl}${ind(2)}<key>NSAllowsLocalNetworking</key>${nl}${ind(2)}<true/>${nl}${ind(1)}</dict>${nl}`,
      })
    }
    else if (ats.tokens[0]?.kind === 'empty' && ats.tokens[0].tag === 'dict') {
      // `<dict/>`: replace it.
      added.push('NSAppTransportSecurity: NSAllowsLocalNetworking')
      edits.push({
        at: ats.valueStart,
        text: `<dict>${nl}${ind(2)}<key>NSAllowsLocalNetworking</key>${nl}${ind(2)}<true/>${nl}${ind(1)}</dict>`,
        remove: ats.valueEnd - ats.valueStart,
      })
    }
    else if (ats.tokens[0]?.kind === 'open' && !ats.tokens.some(token => token.kind === 'key' && token.text === 'NSAllowsLocalNetworking')) {
      added.push('NSAppTransportSecurity: NSAllowsLocalNetworking')
      const close = ats.tokens[ats.tokens.length - 1]!
      edits.push({ at: lineStart(xml, close.start), text: `${ind(2)}<key>NSAllowsLocalNetworking</key>${nl}${ind(2)}<true/>${nl}` })
    }
    if (!entries.some(entry => entry.key === 'NSLocalNetworkUsageDescription')) {
      added.push('NSLocalNetworkUsageDescription')
      edits.push({
        at: lineStart(xml, closeStart),
        text: `${ind(1)}<key>NSLocalNetworkUsageDescription</key>${nl}${ind(1)}<string>Connects to a development server on your local network.</string>${nl}`,
      })
    }
  }

  if (!edits.length) return { contents: xml, changed: false, added }
  let contents = xml
  for (const edit of [...edits].sort((a, b) => b.at - a.at)) {
    contents = contents.slice(0, edit.at) + edit.text + contents.slice(edit.at + (edit.remove ?? 0))
  }
  return { contents, changed: true, added }
}

/** The whitespace before the token at `offset`, when it starts its line. */
function lineIndent(xml: string, offset: number): string {
  const start = xml.lastIndexOf('\n', offset - 1) + 1
  const prefix = xml.slice(start, offset)
  return /^[ \t]*$/.test(prefix) ? prefix : ''
}

/** The start of the line of `offset` when only whitespace precedes it there, else `offset`. */
function lineStart(xml: string, offset: number): number {
  const start = xml.lastIndexOf('\n', offset - 1) + 1
  return /^[ \t]*$/.test(xml.slice(start, offset)) ? start : offset
}
