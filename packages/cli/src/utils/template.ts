import { downloadTemplate } from 'giget'

export const downloadTemplateToDir = async (
  { template, path, cwd }:
  { template: string, path: string, cwd?: string },
) => {
  return downloadTemplate(template, {
    cwd,
    dir: path,
  })
}
