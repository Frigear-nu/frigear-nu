import { defineCommand, runMain } from 'citty'
import pkg from '../package.json' with { type: 'json' }

export const mainCmd = defineCommand({
  meta: {
    name: 'frigear-nu',
    version: pkg.version,
    description: 'Scaffold Frigear projects, apps and modules, and upgrade them',
  },
  subCommands: {
    'init': () => import('./commands/init.ts').then(module => module.default),
    'platform': () => import('./commands/platform/index.ts').then(module => module.default),
    'app:create': () => import('./commands/app-create.ts').then(module => module.default),
    'module:create': () => import('./commands/module-create.ts').then(module => module.default),
    'module:folder': () => import('./commands/module-folder.ts').then(module => module.default),
    'module:move': () => import('./commands/module-move.ts').then(module => module.default),
    'package:rename': () => import('./commands/package-rename.ts').then(module => module.default),
    'add': () => import('./commands/add.ts').then(module => module.default),
    'upgrade': () => import('./commands/upgrade.ts').then(module => module.default),
    'prepare': () => import('./commands/prepare/index.ts').then(module => module.default),
  },
})

export default async function main() {
  await runMain(mainCmd)
}
