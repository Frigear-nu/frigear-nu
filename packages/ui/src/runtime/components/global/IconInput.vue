<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { $fetch } from '#imports'

type FormItem = {
  options?: string[]
}

const props = withDefaults(defineProps<{
  formItem?: FormItem
}>(), {
  formItem: () => ({}),
})

const model = defineModel<string>({ default: '' })

// Ensure ${collection}:${name} is preserved when collection is hyphenated
const HYPHENATED_COLLECTION_PREFIXES = [
  'material-symbols-light',
  'material-symbols',
  'fluent-emoji-high-contrast',
  'fluent-emoji-flat',
  'fluent-emoji',
  'simple-icons',
  'flat-color-icons',
  'line-md',
  'svg-spinners',
  'vscode-icons',
  'game-icons',
  'file-icons',
  'flag-icons',
  'circle-flags',
  'fa6-brands',
  'fa6-regular',
  'fa6-solid',
  'fa-brands',
  'fa-regular',
  'fa-solid',
  'skill-icons',
  'token-branded',
] as const

function normalizeIconName(stored: string): string {
  if (!stored.startsWith('i-')) {
    return stored
  }

  const body = stored.slice(2)

  if (body.includes(':')) {
    return stored
  }

  for (const prefix of HYPHENATED_COLLECTION_PREFIXES) {
    const lead = `${prefix}-`

    if (body.startsWith(lead) && body.length > lead.length) {
      return `i-${prefix}:${body.slice(lead.length)}`
    }
  }

  return stored
}

const resolvedIconName = computed(() => normalizeIconName(model.value))

const search = ref('')
const icons = ref<string[]>([])
const isLoading = ref(false)
const popoverOpen = ref(false)

function resolveIconLibraries(
  fieldOptions: string[] | undefined,
  globalLibraries: string[] | undefined,
): 'all' | string[] {
  if (Array.isArray(fieldOptions) && fieldOptions.length > 0) {
    return fieldOptions
  }
  if (Array.isArray(globalLibraries) && globalLibraries.length > 0) {
    return globalLibraries
  }
  return 'all'
}

const iconLibraries = computed(() => {
  return resolveIconLibraries(
    props.formItem?.options as string[] | undefined,
    [],
  )
})

// Fetch icons from Iconify API
async function fetchIcons(query: string) {
  if (!query || query.length < 2) {
    icons.value = []
    return
  }

  isLoading.value = true
  try {
    const prefixes = iconLibraries.value === 'all' ? '' : iconLibraries.value.join(',')
    const data = await $fetch<{ icons?: string[] }>(
      `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=30` + (prefixes ? `&prefixes=${prefixes}` : ''),
    )
    icons.value = data.icons || []
  }
  catch {
    icons.value = []
  }
  finally {
    isLoading.value = false
  }
}

const debouncedFetch = useDebounceFn(fetchIcons, 300)

watch(search, (value) => {
  debouncedFetch(value)
})

function selectIcon(icon: string) {
  model.value = `i-${icon}`
  popoverOpen.value = false
  search.value = ''
  icons.value = []
}
</script>

<template>
  <div class="flex items-center gap-1">
    <div class="flex items-center justify-center size-8 bg-muted border border-muted rounded-md shrink-0">
      <UIcon
        v-if="model"
        :name="resolvedIconName"
        class="size-5"
      />
      <UIcon
        v-else
        name="i-lucide-shapes"
        class="size-5 text-dimmed"
      />
    </div>

    <UInput
      v-model="model"
      placeholder="Select icon..."
      class="flex-1"
    >
      <template #trailing>
        <UPopover
          v-model:open="popoverOpen"
          :content="{ side: 'left' }"
          :ui="{ content: 'z-auto' }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-search"
            class="cursor-pointer"
          />

          <template #content>
            <div class="p-3 w-80">
              <UInput
                v-model="search"
                placeholder="Find icons..."
                icon="i-lucide-search"
                autofocus
                class="mb-3 w-full"
              />

              <div
                v-if="isLoading"
                class="flex items-center justify-center py-4"
              >
                <UIcon
                  name="i-lucide-loader-2"
                  class="size-5 animate-spin text-muted"
                />
              </div>

              <div
                v-else-if="icons.length > 0"
                style="display: grid; grid-template-columns: repeat(6, 1fr);"
                class="gap-1.5 max-h-48 overflow-y-auto"
              >
                <div
                  v-for="icon in icons"
                  :key="icon"
                  class="flex items-center justify-center"
                >
                  <UTooltip :text="icon">
                    <UButton
                      color="neutral"
                      variant="soft"
                      :icon="`i-${icon}`"
                      @click="selectIcon(icon)"
                    />
                  </UTooltip>
                </div>
              </div>
              <p
                v-else-if="search.length >= 2"
                class="text-xs text-muted text-center py-4"
              >
                No icons found...
              </p>

              <p
                v-else
                class="text-sm text-muted text-center py-4"
              >
                e.g Lamp, Book or Dashboard
              </p>

              <p class="text-xs text-dimmed mt-2">
                Libraries: {{ iconLibraries === 'all' ? 'All' : iconLibraries.join(', ') }}
              </p>
            </div>
          </template>
        </UPopover>
      </template>
    </UInput>
  </div>
</template>
