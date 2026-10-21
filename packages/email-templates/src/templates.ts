import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import type { EmailTemplateFile } from './runtime/types'

/** Top-level `*.vue` files of a directory, the way nuxt-email-renderer names them. */
export function scanTemplateDir(dir: string): EmailTemplateFile[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.vue') && statSync(join(dir, file)).isFile())
    .map((filename) => {
      const name = basename(filename, extname(filename))
      return {
        name,
        filename,
        displayName: name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').trim(),
        importPath: `#email-templates/${name}`,
        filePath: join(dir, filename),
      }
    })
}

/**
 * The template directory of every layer, highest priority first: `nuxtEmailRenderer.emailsDir`,
 * else `app/emails`, else `emails/` - the same rule nuxt-email-renderer applies.
 */
export function layerTemplateDirs(nuxt: Nuxt): string[] {
  const emailsDir = (nuxt.options as { nuxtEmailRenderer?: { emailsDir?: string } }).nuxtEmailRenderer?.emailsDir
  const dirs: string[] = []
  for (const layer of nuxt.options._layers) {
    const candidates = [
      ...(emailsDir ? [resolve(layer.cwd, emailsDir)] : []),
      join(layer.cwd, 'app', 'emails'),
      join(layer.cwd, 'emails'),
    ]
    const dir = candidates.find(candidate => existsSync(candidate))
    if (dir) dirs.push(dir)
  }
  return dirs
}

/**
 * Every template by name. Module templates come first so any layer (and the host above all) can
 * override one by adding a file with the same name.
 */
export function mergeTemplates(moduleDirs: string[], layerDirs: string[]): Record<string, EmailTemplateFile> {
  const templates: Record<string, EmailTemplateFile> = {}
  for (const dir of [...moduleDirs, ...[...layerDirs].reverse()]) {
    for (const template of scanTemplateDir(dir)) templates[template.name] = template
  }
  return templates
}

/** The `#email-templates` virtual module, in the shape nuxt-email-renderer's runtime reads. */
export function templatesVirtualModule(templates: Record<string, EmailTemplateFile>): string {
  const entries = Object.values(templates)
  return [
    ...entries.map((template, index) => `import Template${index} from ${JSON.stringify(template.filePath)}`),
    '',
    `export const emailTemplates = {\n${entries.map((template, index) => `  ${JSON.stringify(template.name)}: Template${index}`).join(',\n')}\n}`,
    '',
    `export const emailTemplateMapping = ${JSON.stringify(templates, null, 2)}`,
    '',
    'export function getEmailTemplate(name) {\n  return emailTemplates[name]\n}',
    '',
  ].join('\n')
}
