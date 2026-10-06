import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('account pages (without @frigear-nu/menus installed)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/pages-without-menus', import.meta.url)),
  })

  it('still renders the profile and security pages', async () => {
    await expect($fetch('/account/profile')).resolves.toContain('Profile')
    await expect($fetch('/account/security')).resolves.toContain('Change password')
  })

  it('skips the dashboard page since it requires @frigear-nu/menus', async () => {
    await expect($fetch('/account')).rejects.toMatchObject({ statusCode: 404 })
  })
})
