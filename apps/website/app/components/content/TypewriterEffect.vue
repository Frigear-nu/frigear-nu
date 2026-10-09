<script setup lang="ts">
/**
 * Types out each item in `items` in sequence (type → pause → delete → next).
 * Items support light inline markup, e.g. `Welcome [TO THIS]{.text-primary.font-bold}`,
 * `**bold**`, `*italic*` and `` `code` `` — see `utils/typewriter.ts`.
 */
type Props = {
  items?: string[]
  speed?: number
  backSpeed?: number
  pauseMs?: number
  loop?: boolean
  caret?: boolean
  class?: string
  tag?: string
  jitter?: number
  punctPauseMs?: number
}

const props = withDefaults(defineProps<Props>(), {
  items: () => [],
  speed: 12,
  backSpeed: 28,
  pauseMs: 1400,
  loop: true,
  caret: true,
  tag: 'span',
  jitter: 0.35,
  punctPauseMs: 220,
})

const parsed = computed(() => props.items.map(item => parseInlineMarkup(String(item))))

// Reserve the height/width of the longest phrase so nothing jumps while typing.
const sizerRuns = computed(() => {
  const longest = parsed.value.reduce<TypewriterCell[]>(
    (acc, cells) => (cells.length > acc.length ? cells : acc),
    [],
  )
  return typewriterRuns(longest)
})

const srText = computed(() => parsed.value.map(typewriterPlainText).join(', '))

const idx = ref(0)
const count = ref(0)
const typing = ref(false)

const runs = computed(() => typewriterRuns(parsed.value[idx.value] ?? [], count.value))

let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false

const keystroke = (cps: number) => {
  const base = 1000 / Math.max(1, cps)
  const spread = base * Math.max(0, Math.min(1, props.jitter))
  return Math.max(10, base + (Math.random() * 2 - 1) * spread)
}

const wait = (ms: number) => new Promise<void>((resolve) => {
  timer = setTimeout(resolve, ms)
})

async function runLoop() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  while (!stopped && parsed.value.length) {
    const cells = parsed.value[idx.value] ?? []

    if (reduceMotion) {
      count.value = cells.length
      await wait(props.pauseMs * 2)
    } else {
      typing.value = true
      for (let n = count.value; n < cells.length && !stopped; n++) {
        count.value = n + 1
        await wait(keystroke(props.speed) + (/[.,!?;:]/.test(cells[n]!.char) ? props.punctPauseMs : 0))
      }
      typing.value = false
      await wait(props.pauseMs)
      typing.value = true
      while (count.value > 0 && !stopped) {
        count.value--
        await wait(keystroke(props.backSpeed))
      }
    }

    if (!props.loop && idx.value >= parsed.value.length - 1) {
      // Leave the last phrase on screen when not looping.
      count.value = (parsed.value[idx.value] ?? []).length
      typing.value = false
      return
    }
    idx.value = (idx.value + 1) % parsed.value.length
    count.value = 0
  }
}

onMounted(() => {
  runLoop()
})

onBeforeUnmount(() => {
  stopped = true
  clearTimeout(timer)
})
</script>

<template>
  <component
    :is="tag"
    :class="['typewriter-root', props.class]"
  >
    <span class="sr-only">{{ srText }}</span>

    <span
      class="typewriter-sizer"
      aria-hidden="true"
    >
      <span
        v-for="(run, i) in sizerRuns"
        :key="i"
        :class="run.class"
      >{{ run.text }}</span>&#8203;
    </span>

    <span
      class="typewriter-live"
      aria-hidden="true"
    >
      <span
        v-for="(run, i) in runs"
        :key="i"
        :class="run.class"
      >{{ run.text }}</span><span
        v-if="caret"
        class="ml-[0.05em] inline-block h-[1em] w-[0.08em] bg-current align-text-bottom"
        :class="{ 'motion-safe:animate-[typewriter-blink_1s_steps(2,start)_infinite]': !typing }"
      />
    </span>
  </component>
</template>

<style>
.typewriter-root {
  position: relative;
  display: block;
  width: 100%;
  line-height: 1.1;
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

@keyframes typewriter-blink {
  to {
    visibility: hidden;
  }
}
</style>
