<script setup lang="ts">
import {
  h, Fragment, onBeforeUnmount, onMounted, ref, computed, useSlots, watch, defineComponent, resolveComponent,
} from 'vue'

/* eslint-disable no-use-before-define */
type AnyObj = Record<string, unknown>
type Props = {
  items?: Array<string | AnyObj>
  speed?: number
  backSpeed?: number
  pauseMs?: number
  loop?: boolean
  caret?: boolean
  class?: string
  textClass?: string
  tag?: string
  jitter?: number
  punctPauseMs?: number
}

const props = withDefaults(defineProps<Props>(), {
  speed: 10,
  backSpeed: 20,
  pauseMs: 900,
  loop: true,
  caret: true,
  tag: 'span',
  jitter: 0.25,
  punctPauseMs: 220,
})

const MDCComp = resolveComponent('MDC')

const Rendered = defineComponent<{ nodes: unknown[] }>({
  name: 'Rendered',
  props: { nodes: { type: Array, required: true } },
  setup(p) {
    return () => h(Fragment as never, null, p.nodes)
  },
})

const slots = useSlots()

const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

const splitG = (s: string): string[] => seg ? Array.from(seg.segment(s), x => x.segment) : Array.from(s)

const isMdcAst = (x: any) =>
  x && typeof x === 'object' && (
    typeof x.type === 'string' // mdast/hast style
    || ('children' in x || 'value' in x) // lenient
  )

// Extract items from slot:
// - Plain text -> split on newlines into multiple items
// - <MDC :value="ast" /> -> keep as single MDC item
const slotItems = computed<(string | AnyObj)[]>(() => {
  const v = slots.default?.() ?? []
  const out: (string | AnyObj)[] = []

  for (const n of v) {
    // <MDC :value="..."/>
    if (n && typeof n === 'object' && (n.type?.name === 'MDC' || n.type === MDCComp)) {
      const ast = (n.props && (n.props.value ?? n.props.ast)) ?? null
      if (ast) out.push(ast)
      continue
    }

    if (typeof n === 'string') {
      out.push(...n.split(/\r?\n/).map(s => s.trim()).filter(Boolean))
      continue
    }

    const txt = vnodeToText(n)
    if (txt) out.push(...txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean))
  }

  return out
})

function vnodeToText(node: any): string {
  if (!node) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(vnodeToText).join('')
  if (typeof node === 'object') {
    const c = node.children
    if (typeof c === 'string' || typeof c === 'number') return String(c)
    if (Array.isArray(c)) return c.map(vnodeToText).join('')
    return ''
  }
  return ''
}

const normalizedItems = computed<(string | AnyObj)[]>(
  () => (props.items?.length ? props.items : slotItems.value),
)

const isClient = ref(false)
const idx = ref(0)
const phase = ref<'typing' | 'deleting' | 'pause'>('typing')
const charIdx = ref(0)

let raf: number | null = null
let lastTs = 0
let untilNextMs = 0
let endPauseTimer: number | null = null

const hasItems = computed(() => normalizedItems.value.length > 0)
const currentItem = computed(() => normalizedItems.value[idx.value])

const currentItemText = computed(() => {
  if (typeof currentItem.value === 'string') return currentItem.value
  if (isMdcAst(currentItem.value)) return mdcText(currentItem.value)
  return ''
})

const allG = computed(() => splitG(currentItemText.value))

const nextIndex = () => {
  if (!props.loop && idx.value >= normalizedItems.value.length - 1) return
  idx.value = (idx.value + 1) % Math.max(1, normalizedItems.value.length)
}

const keystroke = (cps: number) => {
  const base = 1000 / Math.max(1, cps)
  const delta = base * Math.max(0, Math.min(1, props.jitter))
  return base + (Math.random() * 2 - 1) * delta
}

const punctPause = (ch: string) => (/[.,!?;:]/.test(ch) ? props.punctPauseMs : 0)

const tick = (ts: number) => {
  if (!hasItems.value) {
    raf = requestAnimationFrame(tick)
    return
  }

  if (!lastTs) lastTs = ts
  const dt = ts - lastTs
  lastTs = ts
  untilNextMs -= dt

  if (phase.value === 'typing') {
    if (untilNextMs <= 0) {
      const next = allG.value[charIdx.value]
      if (next !== undefined) {
        charIdx.value++
        untilNextMs = keystroke(props.speed) + punctPause(next)
      }
      else {
        phase.value = 'pause'
        if (endPauseTimer) clearTimeout(endPauseTimer)
        endPauseTimer = window.setTimeout(() => {
          phase.value = 'deleting'
        }, props.pauseMs) as unknown as number
      }
    }
  }
  else if (phase.value === 'deleting') {
    if (untilNextMs <= 0) {
      if (charIdx.value > 0) {
        charIdx.value--
        untilNextMs = keystroke(props.backSpeed) * 0.9
      }
      else {
        nextIndex()
        phase.value = 'typing'
        untilNextMs = keystroke(props.speed)
      }
    }
  }

  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  isClient.value = true
  lastTs = 0
  untilNextMs = keystroke(props.speed)
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (endPauseTimer) clearTimeout(endPauseTimer)
})

watch(currentItem, () => {
  if (phase.value === 'typing') {
    charIdx.value = 0
    untilNextMs = keystroke(props.speed)
  }
})

/* ---------- MDC slicing ---------- */
// Extract visible text from MDC AST for timing
function mdcText(node: any): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(mdcText).join('')
  if (typeof node === 'object') {
    if (typeof node.value === 'string') return node.value
    if (Array.isArray(node.children)) return node.children.map(mdcText).join('')
    return ''
  }
  return ''
}

// Deep slice MDC AST by grapheme count
function sliceMdc(node: any, take: { n: number }): any | null {
  if (take.n <= 0 || node == null) return null

  if (typeof node === 'string') {
    const g = splitG(node)
    if (g.length <= take.n) {
      take.n -= g.length
      return node
    }
    const part = g.slice(0, take.n).join('')
    take.n = 0
    return part
  }
  
  if (Array.isArray(node)) {
    const out: any[] = []
    for (const child of node) {
      if (take.n <= 0) break
      const s = sliceMdc(child, take)
      if (s != null) out.push(s)
    }
    return out
  }

  if (typeof node === 'object') {
    // text-like node
    if (typeof node.value === 'string') {
      const g = splitG(node.value)
      if (g.length <= take.n) {
        take.n -= g.length
        return { ...node }
      }
      const part = g.slice(0, take.n).join('')
      take.n = 0
      return { ...node, value: part }
    }

    // container
    if (Array.isArray(node.children)) {
      const kids: any[] = []
      for (const k of node.children) {
        if (take.n <= 0) break
        const kk = sliceMdc(k, take)
        if (kk != null) kids.push(kk)
      }
    // keep node shell so formatting remains
      return { ...node, children: kids }
    }

    return { ...node }
  }

  return null
}

/* ---------- Rendered nodes ---------- */
const renderedNodes = computed(() => {
  const item = currentItem.value
  const count = charIdx.value

  // strings
  if (typeof item === 'string') {
    const g = splitG(item).slice(0, count).join('')
    return [g]
  }

  // MDC AST
  if (isMdcAst(item)) {
    const taken = { n: count }
    const sliced = sliceMdc(item, taken)
    return [h(MDCComp as any, { value: sliced })]
  }
  
  // fallback: slot vnode truncation (plain vnode children)
  const slotVNodes = slots.default?.() ?? []
  return truncateVNodes(slotVNodes, count)
})

function truncateVNodes(nodes: any[], takeChars: number): any[] {
  let remaining = takeChars

  const cloneNode = (node: any): any => {
    if (remaining <= 0 || node == null) return null

    if (typeof node === 'string' || typeof node === 'number') {
      const g = splitG(String(node))
      if (g.length <= remaining) {
        remaining -= g.length
        return String(node)
      }
      const part = g.slice(0, remaining).join('')
      remaining = 0
      return part
    }

    if (Array.isArray(node)) {
      const out: any[] = []
      for (const n of node) {
        if (remaining <= 0) break
        const c = cloneNode(n)
        if (c != null) out.push(c)
      }
      return out
    }

    if (typeof node === 'object') {
      const type = (node as any).type
      const p = (node as any).props || null
      const c = (node as any).children

      if (typeof c === 'string' || typeof c === 'number') {
        const g = splitG(String(c))
        if (g.length <= remaining) {
          remaining -= g.length
          return h(type, p, c)
        }
        const part = g.slice(0, remaining).join('')
        remaining = 0
        return h(type, p, part)
      }

      if (Array.isArray(c)) {
        const kids: any[] = []
        for (const k of c) {
          if (remaining <= 0) break
          const ck = cloneNode(k)
          if (ck != null) kids.push(ck)
        }
        return h(type, p, kids.length ? kids : null)
      }
      
      // components with important props but no children (incl. <MDC :value>) should not render fully,
      // so render an empty shell while typing 0 chars
      return remaining > 0 ? h(type, p, null) : null
    }

    return null
  }

  const out: any[] = []
  for (const n of nodes) {
    if (remaining <= 0) break
    const c = cloneNode(n)
    if (c != null) {
      if (Array.isArray(c)) out.push(...c)
      else out.push(c)
    }
  }

  return out
}

/* ---------- sizing layer: reserve height for the biggest phrase ---------- */
function itemText(item: string | AnyObj | undefined): string {
  if (typeof item === 'string') return item
  if (isMdcAst(item)) return mdcText(item)
  return ''
}

const sizingItem = computed(() => {
  if (!normalizedItems.value.length) return ''
  return normalizedItems.value.reduce((longest, item) => {
    return splitG(itemText(item)).length > splitG(itemText(longest as any)).length ? item : longest
  }, normalizedItems.value[0] as string | AnyObj)
})

const sizingNodes = computed(() => {
  const item = sizingItem.value

  if (typeof item === 'string') return [item]

  if (isMdcAst(item)) {
    return [h(MDCComp as any, { value: item })]
  }

  return []
})
</script>

<template>
  <component
    :is="tag"
    :class="['typewriter-root', props.class]"
  >
    <span
      class="typewriter-sizer"
      aria-hidden="true"
    >
      <Rendered :nodes="sizingNodes" />
      <span
        v-if="caret"
        class="w-px inline-block"
        aria-hidden="true"
      />
    </span>

    <span class="typewriter-live">
      <Rendered :nodes="renderedNodes" />
      <span
        v-if="caret"
        class="w-px bg-current inline-block align-baseline"
        :class="phase !== 'pause' ? 'animate-[blink_1s_steps(2,start)_infinite]' : 'opacity-0'"
        aria-hidden="true"
      />
    </span>
  </component>
</template>
<style>

.typewriter-root {
  position: relative;
  display: block;
  width: 100%;
  line-height: 1.05;
  text-wrap: auto;
}

.typewriter-sizer {
  display: block;
  visibility: hidden;
  pointer-events: none;
}

.typewriter-live {
  position: absolute;
  inset: 0;
  display: block;
}

@media (min-width: 640px) {
  .typewriter-root,
  .typewriter-sizer,
  .typewriter-live {
    white-space: nowrap;
  }
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}
</style>