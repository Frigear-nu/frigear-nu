#!/usr/bin/env node
// The published package runs the built CLI; inside the workspace (no build) the TypeScript source through jiti.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const built = new URL('../dist/runtime/cli/main.js', import.meta.url)
let cli
if (existsSync(fileURLToPath(built))) {
  cli = await import(built.href)
}
else {
  const { createJiti } = await import('jiti')
  cli = await createJiti(import.meta.url).import(fileURLToPath(new URL('../src/runtime/cli/main.ts', import.meta.url)))
}
process.exitCode = await cli.main()
