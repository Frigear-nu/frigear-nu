#!/usr/bin/env node
// Docs safety net: checks internal links, anchors, redirects, external docs URLs and the glossary of apps/docs.
// Zero dependencies. Run from anywhere: `node scripts/docs-check-links.mjs [--terms [folder ...] [--strict]]`.
//
// Why this exists: CI skips `**/*.md` and the docs app has no lint/test, so a broken link would only show up in
// production. Anchors are computed exactly like @nuxtjs/mdc's compiler (see `headingId`).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(ROOT, 'apps/docs/content')
const PUBLIC = join(ROOT, 'apps/docs/public')
const GLOSSARY = join(CONTENT, '2.guide/1.concepts/6.glossary.md')
const DOCS_URL = /https:\/\/docs\.frigear\.dev(\/[^\s)"'<>\]`]*)?/g

const args = process.argv.slice(2)
const termsMode = args.includes('--terms')
const strict = args.includes('--strict')
const termFolders = termsMode ? args.slice(args.indexOf('--terms') + 1).filter(a => !a.startsWith('--')) : []

const problems = [] // { text, error }
let linkCount = 0
const rel = p => relative(ROOT, p)
const report = (file, line, link, reason, error = true) =>
  problems.push({ error, text: `${error ? '' : 'warn: '}${file}:${line}  ${link}  ${reason}` })

// ---------------------------------------------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------------------------------------------
function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '.nuxt' || name === '.output') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, filter, out)
    else if (filter(full)) out.push(full)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Markdown scanning: yields lines tagged with whether they are inside a fenced code block or front matter
// ---------------------------------------------------------------------------------------------------------------
function scanLines(source) {
  const lines = source.split(/\r?\n/)
  const out = []
  let fence = null // { char, len }
  let inFront = lines[0]?.trim() === '---'
  lines.forEach((text, i) => {
    const n = i + 1
    if (inFront) {
      if (i > 0 && text.trim() === '---') { inFront = false; out.push({ n, text, kind: 'meta' }); return }
      out.push({ n, text, kind: 'meta' })
      return
    }
    const m = /^\s*(`{3,}|~{3,})/.exec(text)
    if (fence) {
      if (m && m[1][0] === fence.char && m[1].length >= fence.len && /^\s*[`~]+\s*$/.test(text)) fence = null
      out.push({ n, text, kind: 'code' })
      return
    }
    if (m) { fence = { char: m[1][0], len: m[1].length }; out.push({ n, text, kind: 'code' }); return }
    out.push({ n, text, kind: 'prose' })
  })
  return out
}
const stripInlineCode = text => text.replace(/(`+)[^`]*?\1/g, m => ' '.repeat(m.length))

// ---------------------------------------------------------------------------------------------------------------
// Heading ids, as @nuxtjs/mdc computes them (runtime/parser/compiler.js):
//   id = props.id || slugger.slug(plainText)       (github-slugger: lowercase, drop chars outside
//                                                   [\p{L}\p{N}\p{M}\p{Pc} -], spaces -> '-', repeats get -1, -2)
//   id = id.replace(/-+/g, '-').replace(/^-|-$/g, '').replace(/^(\d)/, '_$1')
// ---------------------------------------------------------------------------------------------------------------
function headingPlainText(raw) {
  return raw
    .replace(/\s+#+\s*$/, '') // closing #s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [t](u) -> t
    .replace(/:[a-z][\w-]*\[([^\]]*)\](\{[^}]*\})?/gi, '$1') // :badge[text]{..} -> text
    .replace(/:[a-z][\w-]*(\{[^}]*\})?/gi, m => (/^:[a-z][\w-]*\{/i.test(m) ? '' : m)) // :icon{name=x} -> ''
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_)/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}
const slugRemove = /[^\p{L}\p{N}\p{M}\p{Pc} -]/gu
const finishId = id => id.replace(/-+/g, '-').replace(/^-|-$/g, '').replace(/^(\d)/, '_$1')

function collectAnchors(lines) {
  const seen = new Map() // github-slugger occurrence counter, per page
  const ids = new Set()
  for (const { text, kind } of lines) {
    if (kind !== 'prose') continue
    const m = /^ {0,3}(#{1,6})\s+(.+?)\s*$/.exec(text)
    if (!m) continue
    let body = m[2]
    let explicit = null
    const e = /\s*\{#([^}\s]+)\}\s*$/.exec(body)
    if (e) { explicit = e[1]; body = body.slice(0, e.index) }
    if (explicit) { ids.add(finishId(explicit)); continue } // explicit ids do not consume a slugger slot
    let slug = headingPlainText(body).toLowerCase().replace(slugRemove, '').replace(/ /g, '-')
    const original = slug
    while (seen.has(slug)) { // github-slugger: bump the counter until the candidate is unused
      const c = seen.get(original) + 1
      seen.set(original, c)
      slug = `${original}-${c}`
    }
    seen.set(slug, 0)
    if (!seen.has(original)) seen.set(original, 0)
    ids.add(finishId(slug))
  }
  return ids
}

// ---------------------------------------------------------------------------------------------------------------
// Routes (one per markdown file) and their anchors
// ---------------------------------------------------------------------------------------------------------------
const files = walk(CONTENT, f => f.endsWith('.md'))
const pages = new Map() // route -> { file, lines, anchors }
const toRoute = file => {
  const segs = relative(CONTENT, file).replace(/\.md$/, '').split('/').map(s => s.replace(/^\d+\./, ''))
  if (segs.at(-1) === 'index') segs.pop()
  return '/' + segs.join('/')
}
for (const file of files) {
  const lines = scanLines(readFileSync(file, 'utf8'))
  pages.set(toRoute(file), { file, lines, anchors: collectAnchors(lines) })
}

// ---------------------------------------------------------------------------------------------------------------
// Redirects from apps/docs/nuxt.config.ts: `"/from": "/to",`
// ---------------------------------------------------------------------------------------------------------------
const redirects = new Map()
{
  const cfg = readFileSync(join(ROOT, 'apps/docs/nuxt.config.ts'), 'utf8')
  const block = /const redirects[^{]*\{([\s\S]*?)\n\}/.exec(cfg)?.[1] ?? ''
  for (const m of block.matchAll(/['"](\/[^'"]*)['"]\s*:\s*['"](\/[^'"]*)['"]/g)) redirects.set(m[1], m[2])
}

// ---------------------------------------------------------------------------------------------------------------
// Resolving one link target. `target` is the raw href; `from` the current route (for `#anchor` links).
// ---------------------------------------------------------------------------------------------------------------
function splitTarget(target) {
  const noQuery = target.replace(/\?[^#]*/, '')
  const i = noQuery.indexOf('#')
  const path = (i === -1 ? noQuery : noQuery.slice(0, i)).replace(/(.)\/+$/, '$1')
  let anchor = i === -1 ? '' : noQuery.slice(i + 1)
  try { anchor = decodeURIComponent(anchor) } catch { /* keep raw */ }
  return { path, anchor }
}

/** Returns null when fine, or { reason, warn? } */
function resolveTarget(target, currentRoute) {
  if (/^(https?:|mailto:|tel:)/.test(target) || target === '/llms.txt' || target.startsWith('/raw/')) return null
  const { path, anchor } = splitTarget(target)
  if (path === '') {
    return anchor && !pages.get(currentRoute)?.anchors.has(anchor) ? { reason: `anchor #${anchor} not on this page` } : null
  }
  if (redirects.has(path)) return { reason: `redirect source, use the new route ${redirects.get(path)}`, warn: true }
  if (/\.[a-z0-9]+$/i.test(path) && !pages.has(path)) {
    return existsSync(join(PUBLIC, path)) ? null : { reason: `file not found under apps/docs/public` }
  }
  const page = pages.get(path)
  if (!page) return { reason: 'no such route' }
  if (anchor && !page.anchors.has(anchor)) return { reason: `anchor #${anchor} not on ${path}` }
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Content links
// ---------------------------------------------------------------------------------------------------------------
const MD_LINK = /\]\(\s*(<?)((?:\/|#)[^)\s>]*)/g
const PROP_PATTERNS = [/\bto="([^"]+)"/g, /\bhref="(\/[^"]*)"/g, /\bto:\s*['"]?(\/[^\s'"]+|#[^\s'"]+)/g]
for (const [route, { file, lines }] of pages) {
  for (const { n, text, kind } of lines) {
    if (kind === 'code') continue
    const line = kind === 'prose' ? stripInlineCode(text) : text
    const found = []
    if (kind === 'prose') for (const m of line.matchAll(MD_LINK)) found.push(m[2])
    for (const re of PROP_PATTERNS) for (const m of line.matchAll(re)) found.push(m[1])
    // placeholder targets such as ](…), ](...) or ]() render as links the crawler then 404s on
    if (kind === 'prose') {
      for (const m of line.matchAll(/\]\(\s*(…|\.{3}|)\s*\)/g)) {
        linkCount++
        report(rel(file), n, m[0], 'placeholder link target', true)
      }
    }
    for (const target of found) {
      if (!target.startsWith('/') && !target.startsWith('#')) continue
      linkCount++
      const r = resolveTarget(target, route)
      if (r) report(rel(file), n, target, r.reason, !r.warn)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Redirect targets must exist
// ---------------------------------------------------------------------------------------------------------------
for (const [from, to] of redirects) {
  linkCount++
  const r = resolveTarget(to, '/')
  if (r) report('apps/docs/nuxt.config.ts', 0, `${from} -> ${to}`, `redirect target: ${r.reason}`, !r.warn)
}

// ---------------------------------------------------------------------------------------------------------------
// 3. External references to https://docs.frigear.dev/...
// ---------------------------------------------------------------------------------------------------------------
{
  const externals = [
    ...walk(join(ROOT, 'packages'), f => /\/packages\/[^/]+\/(package\.json|README\.md)$/.test(f)),
    ...walk(join(ROOT, '.starters'), f => f.endsWith('/AGENTS.md')),
    join(ROOT, 'README.md'),
    join(ROOT, 'AGENTS.md'),
  ].filter(existsSync)
  for (const file of externals) {
    const src = readFileSync(file, 'utf8')
    const isPkg = file.endsWith('package.json')
    const text = isPkg ? JSON.stringify({ homepage: JSON.parse(src).homepage ?? '' }, null, 1) : src
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(DOCS_URL)) {
        const path = (m[1] ?? '/').replace(/[.,;:]+$/, '')
        if (path.startsWith('/raw/')) continue
        linkCount++
        const r = resolveTarget(path, '/')
        // package.json lines are synthetic, point at the homepage field instead
        if (r) report(rel(file), isPkg ? 0 : i + 1, m[0], r.reason, !r.warn)
      }
    })
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Glossary: owner routes must resolve
// ---------------------------------------------------------------------------------------------------------------
function parseGlossary() {
  const rows = []
  const lines = readFileSync(GLOSSARY, 'utf8').split(/\r?\n/)
  let cols = null
  lines.forEach((text, i) => {
    if (!text.trim().startsWith('|')) { cols = null; return }
    const cells = text.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) return
    if (!cols) {
      cols = { owner: cells.findIndex(c => /owner|explained/i.test(c)), replaces: cells.findIndex(c => /replaces|instead/i.test(c)) }
      return
    }
    rows.push({ n: i + 1, term: cells[0], owner: cells[cols.owner] ?? '', replaces: cols.replaces >= 0 ? cells[cols.replaces] ?? '' : '' })
  })
  return rows
}
const glossaryExists = existsSync(GLOSSARY)
let glossaryRows = []
if (!glossaryExists) {
  console.log('glossary: not found, skipped')
} else {
  glossaryRows = parseGlossary()
  for (const row of glossaryRows) {
    for (const m of row.owner.matchAll(/\(?(\/[^\s)`|]*(?:#[^\s)`|]*)?)\)?/g)) {
      linkCount++
      const r = resolveTarget(m[1].replace(/[.,;]+$/, ''), '/')
      if (r) report(rel(GLOSSARY), row.n, m[1], `glossary owner "${row.term}": ${r.reason}`, !r.warn)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 5. --terms: legacy vocabulary left in prose
// ---------------------------------------------------------------------------------------------------------------
if (termsMode && glossaryExists) {
  const variants = new Set()
  for (const row of glossaryRows) {
    for (const v of row.replaces.split(/[,;]/)) {
      const t = v.replace(/\([^)]*\)/g, '').replace(/[`*]/g, '').trim()
      if (t && t !== '-' && t !== '—') variants.add(t)
    }
  }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regexes = [...variants].map(v => ({ v, re: new RegExp(`(?<![\\w-])${esc(v)}(?![\\w-])`, 'gi') }))
  const scoped = termFolders.length ? termFolders.map(f => resolve(f)) : [CONTENT]
  const perFile = new Map()
  const termsSkip = ['apps/docs/content/2.guide/1.concepts/6.glossary.md', 'apps/docs/content/5.contribute/6.documentation.md']
  let total = 0
  for (const { file, lines } of pages.values()) {
    if (!scoped.some(s => file === s || file.startsWith(s + '/'))) continue
    if (termsSkip.includes(rel(file))) continue
    for (const { n, text, kind } of lines) {
      if (kind !== 'prose') continue
      const line = stripInlineCode(text)
      for (const { v, re } of regexes) {
        for (const _ of line.matchAll(re)) {
          total++
          perFile.set(rel(file), (perFile.get(rel(file)) ?? 0) + 1)
          if (strict) report(rel(file), n, v, 'legacy term, see the glossary "Replaces" column')
        }
      }
    }
  }
  if (!strict) {
    for (const [f, c] of [...perFile].sort()) console.log(`terms: ${f}  ${c}`)
    console.log(`terms: ${total} hit(s) in ${perFile.size} file(s) for ${variants.size} variant(s)`)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------
for (const p of problems) console.log(p.text)
const errors = problems.filter(p => p.error).length
const warnings = problems.length - errors
console.log(`docs-check-links: ${pages.size} files, ${linkCount} links, ${errors} errors, ${warnings} warnings`)
process.exit(errors ? 1 : 0)
