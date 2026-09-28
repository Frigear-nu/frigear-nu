<script setup lang="ts">
type ReplaceKey = string | number | symbol | RegExp
type ReplaceFn = (matches: string[]) => string
type ReplaceValue = string | number | ReplaceFn
type ReplaceItem = { match: ReplaceKey, replace: ReplaceValue }

const props = withDefaults(defineProps<{
  parts?: string[]
  replacements?: ReplaceItem[]
}>(), {
  parts: () => ['Copyright ©', '{fullYear}'],
})

const currentUrl = useRequestURL()

// todo: move this logic to a shared space
const allReplacements = computed<ReplaceItem[]>(() => [
  {
    match: '{fullYear}',
    replace: () => String(new Date().getFullYear()),
  },
  {
    match: '{url}',
    replace: () => currentUrl.toString(),
  },
  ...(props.replacements ?? []),
])

const rawItems = computed(() => {
  if (!props.parts || props.parts.length === 0) return ['']
  return props.parts
})

const normalizeMatch = (match: ReplaceKey): RegExp => {
  if (match instanceof RegExp) return match
  return new RegExp(String(match), 'g')
}

const applyReplace = (
  text: string,
  matcher: RegExp,
  replacer: ReplaceValue,
) => {
  if (typeof replacer === 'function') {
    return text.replace(matcher, (...args) => {
      const matches = args.slice(0, -2)
      return replacer(matches)
    })
  }

  return text.replace(matcher, String(replacer))
}

const replaceParts = (text: string) => {
  return allReplacements.value.reduce((acc, item) => {
    const matcher = normalizeMatch(item.match)
    return applyReplace(acc, matcher, item.replace)
  }, text)
}

const text = computed(() => {
  const joined = [...toValue(rawItems)].join(' ')
  return replaceParts(joined)
})
</script>

<template>
  <div class="text-sm text-muted">
    <MDC :value="text" />
  </div>
</template>
