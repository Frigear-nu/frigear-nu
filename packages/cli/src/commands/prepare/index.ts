import { defineCommand } from 'citty'

export default defineCommand({
  meta: {
    name: 'prepare',
    description: 'Prepare a workspace for its first run',
  },
  subCommands: {
    env: () => import('./env.ts').then(module => module.default),
  },
})
