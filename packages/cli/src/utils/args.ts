import type { ArgsDef, Resolvable } from "citty";

export const getDefaultCommandArgs = (): ArgsDef => {
  return {
    cwd: {
      type: 'string',
      description: 'The current working directory',
      default: process.env.INIT_CWD || process.cwd(),
    }
  }
}

export const defineCommandArgs = (args: Resolvable<ArgsDef>): Resolvable<ArgsDef> => {
  return {
    ...getDefaultCommandArgs(),
    ...args,
  }
}