import { spawnSync } from 'node:child_process'

// `pnpm create frigear-app` / `npm create frigear-app`: runs `init` of the latest @frigear-nu/cli through the package
// manager that started it. No dependencies, so a CLI release reaches it without releasing this package.

/** The CLI to run: `@frigear-nu/cli@latest`, or `FRIGEAR_CLI` (a version like `@frigear-nu/cli@0.1.0`, or a tarball). */
export const cliSpec = (env: NodeJS.ProcessEnv = process.env) => env.FRIGEAR_CLI || '@frigear-nu/cli@latest'

/** The command that runs `spec init ...args` with the package manager named in `npm_config_user_agent`. */
export const dlxCommand = (userAgent: string, spec: string, args: string[]): [string, string[]] => {
  const [name = '', version = ''] = userAgent.split(' ')[0]!.split('/')
  const rest = [spec, 'init', ...args]
  if (name === 'pnpm')
    return ['pnpm', ['dlx', ...rest]]
  // Yarn 1 has no dlx.
  if (name === 'yarn' && !version.startsWith('1.'))
    return ['yarn', ['dlx', ...rest]]
  if (name === 'bun')
    return ['bunx', rest]
  // --package also takes a tarball or folder, which npx would try to run as a file.
  return ['npx', ['--yes', '--package', spec, '--', 'frigear-nu', 'init', ...args]]
}

export default function main(args = process.argv.slice(2)) {
  const [command, commandArgs] = dlxCommand(process.env.npm_config_user_agent ?? '', cliSpec(), args)
  const { status, error } = spawnSync(command, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (error) {
    console.error(`Could not run ${command}: ${error.message}`)
    process.exit(1)
  }
  process.exit(status ?? 1)
}
