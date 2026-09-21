import { addTemplate, type Resolver } from '@nuxt/kit'

export const addModuleManifest = (
  moduleName: string,
  _resolver: Resolver,
) => {
  // TODO: This will add a built file with the details about this module.

  addTemplate({
    filename: `${moduleName}.json`,
    write: true,
    getContents: () => {
      return `export default ${JSON.stringify({ moduleName }, null, 2)}`
    },
  })
}
