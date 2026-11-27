import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../src/runtime/app/pages/index.vue', import.meta.url), 'utf8')
const template = page.slice(page.indexOf('<template>'))

describe('the overview page', () => {
  it('has the account.overview area above the links and account.overview.end last, below them', () => {
    const top = template.indexOf('name="account.overview"')
    const links = template.indexOf('<ListCard')
    const end = template.indexOf('name="account.overview.end"')
    expect(top).toBeGreaterThan(-1)
    expect(top).toBeLessThan(links)
    expect(end).toBeGreaterThan(template.indexOf('</ListCard>'))
  })
})
