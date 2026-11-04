import type { ArgsDef } from 'citty'

export const getDefaultCommandArgs = () => {
  return {
    cwd: {
      type: 'string',
      description: 'The current working directory',
      default: process.env.INIT_CWD || process.cwd(),
    },
  } satisfies ArgsDef
}

export const defineCommandArgs = <T extends ArgsDef>(args: T) => {
  return {
    ...getDefaultCommandArgs(),
    ...args,
  }
}

/** Arguments shared by the commands that download from the frigear-nu repository. */
export const templateArgs = {
  ref: {
    type: 'string',
    description: 'Branch or tag of the frigear-nu repository to copy from',
    default: 'main',
  },
  install: {
    type: 'boolean',
    description: 'Install dependencies afterwards (--no-install to skip)',
    default: true,
  },
} satisfies ArgsDef
