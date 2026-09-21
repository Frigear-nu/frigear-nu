import { defineCommand, runMain } from 'citty'

const mainCmd = defineCommand({
  meta: {
    name: 'frigear-nu-cli',
    version: '0.0.1',
  },
  subCommands: {
    'module:upgrade': import('./module/upgrade.ts').then((module) => module.default),
    'module:create': import('./module/create.ts').then((module) => module.default)
  },
})

export default async function main() {
  await runMain(mainCmd)
}
