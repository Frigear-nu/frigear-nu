/** `1.2.3` (a pre-release suffix is kept but compares after its release's parts). */
export type Version = [number, number, number, string]

const VERSION = /(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/

/** The first `x.y.z` in a range or version, or `undefined` for a range without one (`*`, `latest`, `workspace:*`). */
export const parseVersion = (value: string): Version | undefined => {
  const match = value.match(VERSION)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ''] : undefined
}

/** Negative when `a` < `b`, 0 when equal, positive when `a` > `b`. A pre-release sorts before its release. */
export const compareVersions = (a: string, b: string) => {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) throw new Error(`Not a version: ${!va ? a : b}`)
  for (let i = 0; i < 3; i++) {
    const diff = (va[i] as number) - (vb[i] as number)
    if (diff) return diff
  }
  if (va[3] === vb[3]) return 0
  if (!va[3]) return 1
  if (!vb[3]) return -1
  return va[3] < vb[3] ? -1 : 1
}

/** Whether `version` lies in `(from, to]`: a change released in `version` applies when upgrading from `from` to `to`. */
export const isBetween = (version: string, from: string, to: string) =>
  compareVersions(version, from) > 0 && compareVersions(version, to) <= 0

/** Ranges the upgrade never touches: workspace and catalog references, paths, aliases, tags. */
const SKIP = /^(?:workspace:|catalog:|link:|file:|portal:|npm:|git|https?:)/

/**
 * `range` moved to `version`, keeping its operator: `0.3.4` → `0.6.1`, `^0.5.1` → `^0.6.1`, `>=0.3.4` → `>=0.6.1`,
 * `~1.2.0` → `~1.3.5`. `undefined` when the range is not a plain version range (workspace:, catalog:, tags, `||`,
 * hyphen ranges) or already names `version`.
 */
export const rewriteRange = (range: string, version: string) => {
  const trimmed = range.trim()
  if (SKIP.test(trimmed) || /\|\||\s-\s|\s/.test(trimmed)) return undefined
  const match = trimmed.match(/^([\^~]|>=|[>=v])?(\d+\.\d+\.\d+(?:-[\w.-]+)?)$/)
  if (!match) return undefined
  const operator = { 'v': '', '=': '', '>': '>=' }[match[1] ?? ''] ?? match[1] ?? ''
  const next = `${operator}${version}`
  return next === trimmed ? undefined : next
}
