import { initCmd } from '@frigear-nu/cli'
import { defineCommand, runMain } from 'citty'
import pkg from '../package.json' with { type: 'json' }

// `npm create frigear-app` / `pnpm create frigear-app`: the `init` command of @frigear-nu/cli under its own name.
export const createCmd = defineCommand({
  ...initCmd,
  meta: {
    name: 'create-frigear-app',
    version: pkg.version,
    description: 'Create a new project from a Frigear starter',
  },
})

export default async function main() {
  await runMain(createCmd)
}
