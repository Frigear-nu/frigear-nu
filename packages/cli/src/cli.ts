import { defineCommand, runMain } from 'citty'
import pkg from '../package.json' with { type: 'json' }

export const mainCmd = defineCommand({
  meta: {
    name: 'frigear-nu',
    version: pkg.version,
    description: 'Scaffold Frigear projects, apps and modules',
  },
  subCommands: {
    'init': () => import('./commands/init.ts').then(module => module.default),
    'app:create': () => import('./commands/app-create.ts').then(module => module.default),
    'module:create': () => import('./commands/module-create.ts').then(module => module.default),
    'add': () => import('./commands/add.ts').then(module => module.default),
  },
})

export default async function main() {
  await runMain(mainCmd)
}
