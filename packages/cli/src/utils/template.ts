import { downloadTemplate } from 'giget'

export const FRIGEAR_REPO = 'gh:Frigear-nu/frigear-nu'

/** A giget source for a folder of the frigear-nu repository, e.g. `.starters/workspace`. */
export const repoSource = (path: string, ref = 'main') => `${FRIGEAR_REPO}/${path}#${ref}`

export const downloadTemplateToDir = async (
  { template, path, cwd, force }:
  { template: string, path: string, cwd?: string, force?: boolean },
) => {
  return downloadTemplate(template, {
    cwd,
    dir: path,
    force,
  })
}
