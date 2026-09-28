#!/usr/bin/env node
import { createJiti } from 'jiti'

const _import = createJiti(process.cwd(), {
  interopDefault: true,
  esmResolve: true,
  cache: true,
})
const mod = _import(new URL('../src/cli.ts', import.meta.url).pathname)

if (typeof mod?.default === 'function') {
  await mod.default()
}
