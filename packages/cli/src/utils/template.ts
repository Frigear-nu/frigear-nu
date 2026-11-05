import { downloadTemplate } from 'giget'
import { rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const FRIGEAR_REPO = 'gh:Frigear-nu/frigear-nu'

/** A giget source for a folder of the frigear-nu repository, e.g. `.starters/workspace`. */
export const repoSource = (path: string, ref = 'main') => `${FRIGEAR_REPO}/${path}#${ref}`

/** giget's cache folder, worked out the way giget does: `$XDG_CACHE_HOME/giget` or `~/.cache/giget`, `%TEMP%\giget` on Windows. */
export const gigetCacheDir = (env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) => {
  if (platform === 'win32') return resolve(tmpdir(), 'giget')
  return env.XDG_CACHE_HOME ? resolve(env.XDG_CACHE_HOME, 'giget') : resolve(homedir(), '.cache/giget')
}

/** The tarball giget caches for a `gh:owner/repo/path#ref` source (`<cache>/gh/owner-repo/<ref>.tar.gz`), or `undefined` for another source. */
export const cachedTarball = (template: string, cacheDir = gigetCacheDir()) => {
  const match = /^gh:([\w.-]+)\/([\w.-]+)(?:\/[^#]*)?(?:#(.+))?$/.exec(template)
  if (!match) return undefined
  const [, owner, repo, ref = 'main'] = match
  return join(cacheDir, 'gh', `${owner}-${repo}`.replace(/[^\da-z-]/gi, '-'), `${ref}.tar.gz`)
}

/**
 * Copies `template` into `path`. For this repository giget's cached tarball is deleted first: when a download fails
 * (a 404 without `GIGET_AUTH` while the repository is not public) giget silently falls back to that tarball, however
 * old, and the project would get a stale starter. Without it the download error is reported instead.
 */
export const downloadTemplateToDir = async (
  { template, path, cwd, force }:
  { template: string, path: string, cwd?: string, force?: boolean },
) => {
  const cached = template.startsWith(FRIGEAR_REPO) ? cachedTarball(template) : undefined
  if (cached) await Promise.all([rm(cached, { force: true }), rm(`${cached}.json`, { force: true })])
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
