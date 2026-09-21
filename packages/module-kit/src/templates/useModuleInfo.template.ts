const myModuleInfo = {
  name: ':moduleName:',
  version: ':moduleVersion:',
  description: ':moduleDescription:',
} as const

type ModuleInfo = typeof myModuleInfo

export const useMyModuleInfo = (): ModuleInfo => {
  return {
    ...myModuleInfo,
  } as const
}
