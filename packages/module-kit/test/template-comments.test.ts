import { describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NodeTypes, parse } from '@vue/compiler-dom'
import type { ElementNode, ParentNode, TemplateChildNode } from '@vue/compiler-dom'

// Vue keeps template comments in dev, and a comment right before a `v-else-if`/`v-else` branch is folded into that
// branch, which the client then renders as a fragment while the server renders a single node. Hydration fails on it
// (`/login?redirect=` became a 500 this way), so comments go before the first branch or after the last one.
function commentsBeforeElseBranches(parent: ParentNode, file: string): string[] {
  const offenders: string[] = []
  const siblings = parent.children.filter(child => child.type !== NodeTypes.TEXT || child.content.trim())
  siblings.forEach((child: TemplateChildNode, index) => {
    if (child.type === NodeTypes.COMMENT) {
      const next = siblings.slice(index + 1).find(sibling => sibling.type !== NodeTypes.COMMENT)
      const isElseBranch = next?.type === NodeTypes.ELEMENT && next.props.some(prop =>
        prop.type === NodeTypes.DIRECTIVE && (prop.name === 'else' || prop.name === 'else-if'))
      if (isElseBranch) offenders.push(`${file}:${child.loc.start.line}: ${child.content.trim()}`)
    }
    if ('children' in child && Array.isArray(child.children))
      offenders.push(...commentsBeforeElseBranches(child as ElementNode, file))
  })
  return offenders
}

describe('vue templates', () => {
  it('has no comments between v-if branches', () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url))
    const files = globSync('{packages/*/src,apps/*/app}/**/*.vue', { cwd: root })
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.flatMap(file =>
      commentsBeforeElseBranches(parse(readFileSync(`${root}/${file}`, 'utf8'), { parseMode: 'sfc', comments: true }), file))
    expect(offenders).toEqual([])
  })
})
