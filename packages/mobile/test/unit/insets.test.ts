import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../src/runtime/app/assets/mobile.css', import.meta.url), 'utf8')
const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split('}')[0]!

describe('the shell insets with native chrome', () => {
  it('keeps the status bar inset when the native navbar is hidden (it reports a top of 0 then)', () => {
    expect(rule('html.mobile-chrome-native')).toMatch(/--mobile-inset-top:\s*max\(var\(--cap-native-navigation-top, 0px\), env\(safe-area-inset-top, 0px\)\)/)
  })
})
