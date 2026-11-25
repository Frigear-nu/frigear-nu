import { defineCommand } from 'citty'

export default defineCommand({
  meta: {
    name: 'platform',
    description: 'Add apps of a platform to the workspace and set up their native targets',
  },
  subCommands: {
    add: () => import('./add.ts').then(module => module.default),
    init: () => import('./init.ts').then(module => module.default),
    list: () => import('./list.ts').then(module => module.default),
  },
})
