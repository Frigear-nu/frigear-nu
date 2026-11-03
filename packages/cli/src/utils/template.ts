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
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (template.startsWith(FRIGEAR_REPO) && /\b(?:401|403|404)\b/.test(message) && !process.env.GIGET_AUTH) {
      throw new Error(`${message}\nWhile Frigear-nu/frigear-nu is not public, set GIGET_AUTH to a GitHub token that can read it, e.g. GIGET_AUTH=$(gh auth token).`, { cause: error })
    }
    throw error
  })
}
