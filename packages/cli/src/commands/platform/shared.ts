import type { ConsolaInstance } from 'consola'
import { PlatformError } from '../../platform/errors.ts'

/** Reports an error of the platform API and exits; anything else is rethrown. */
export const exitWith = (logger: ConsolaInstance, error: unknown): never => {
  if (error instanceof PlatformError) {
    logger.error(error.message)
    return process.exit(1)
  }
  throw error
}

/** The arguments after a bare `--`, passed through to the script or binary. */
export const passThroughArgs = (rawArgs: string[]) => {
  const index = rawArgs.indexOf('--')
  return index === -1 ? [] : rawArgs.slice(index + 1)
}

export const appsDirArg = {
  'apps-dir': {
    type: 'string',
    description: 'Folder the apps live in: auto (the apps folder you are in, else apps/) or a path',
    default: 'auto',
  },
} as const
