import { describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// `@nuxtjs/i18n` compiles every locale file `registerLocales` contributes, with vue-i18n's message syntax and
// `strictMessage` on. One message it cannot compile fails the whole locale on the client: after hydration no module
// string resolves and every `useModuleT` text falls back to English. The rules below are the ones vue-i18n enforces.

// `detectHtmlTag` of `@intlify/message-compiler` (its `#-/` range spelled out): strictMessage refuses a message that
// looks like HTML.
const HTML_TAG = /<[\w\s"#$%&'()*+,\-./:;=]+>/

/** Why `message` would not compile, or undefined. */
const localeMessageProblem = (message: string): string | undefined => {
  if (HTML_TAG.test(message)) return 'looks like HTML (write <NAME> without the angle brackets)'
  let rest = message
  while (rest.length) {
    const special = rest.search(/[{}@]/)
    if (special === -1) return undefined
    const char = rest[special]
    rest = rest.slice(special)
    if (char === '{') {
      // A placeholder `{name}` / `{0}` or a literal `{'text'}`.
      const placeholder = /^\{\s*(?:\w+|'(?:[^'\\]|\\.)*')\s*\}/.exec(rest)
      if (!placeholder) return `unclosed or invalid placeholder at "${rest.slice(0, 20)}"`
      rest = rest.slice(placeholder[0].length)
    }
    else if (char === '}') {
      return 'a "}" without its "{"'
    }
    else {
      // A linked message `@:other.key` / `@.lower:other.key`; any other "@" is a broken one.
      const linked = /^@(?:\.\w+)?:[\w.-]*\w/.exec(rest)
      if (!linked) return 'an "@" starts a linked message: write a plain one as {\'@\'}'
      rest = rest.slice(linked[0].length)
    }
  }
  return undefined
}

const problems = (file: string) => {
  const found: string[] = []
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      const problem = localeMessageProblem(node)
      if (problem) found.push(`${file} ${path}: ${problem}`)
    }
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key)
    }
  }
  walk(JSON.parse(readFileSync(file, 'utf8')), '')
  return found
}

describe('locale messages', () => {
  it('spots what vue-i18n refuses', () => {
    expect(localeMessageProblem('Hej {name}, du har {count} nye')).toBeUndefined()
    expect(localeMessageProblem('fx support{\'@\'}example.com')).toBeUndefined()
    expect(localeMessageProblem('ingen | én | {n} stk.')).toBeUndefined()
    expect(localeMessageProblem('@:auth.email.placeholder')).toBeUndefined()
    expect(localeMessageProblem('fx support@example.com')).toMatch(/linked message/)
    expect(localeMessageProblem('inbox.secrets.<NAME>')).toMatch(/HTML/)
    expect(localeMessageProblem('Brug <b>fed</b> tekst')).toMatch(/HTML/)
    expect(localeMessageProblem('{ open')).toMatch(/placeholder/)
    expect(localeMessageProblem('close }')).toMatch(/without its/)
  })

  it('compiles every locale file of the workspace', () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url))
    const files = globSync(['packages/*/src/**/i18n/lang/*.json', 'apps/*/i18n/locales/*.json'], { cwd: root })
    expect(files.length).toBeGreaterThan(10)
    expect(files.flatMap(file => problems(`${root}/${file}`).map(problem => problem.replace(root, '')))).toEqual([])
  })
})
