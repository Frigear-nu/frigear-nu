import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure logic only (options, the generated Tauri config, the merge, the CLI and the doctor): no Nuxt fixture to boot.
    name: 'unit',
    include: ['test/unit/*.{test,spec}.ts'],
    environment: 'node',
  },
})
