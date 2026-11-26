<script setup lang="ts">
import { grantFields } from '#auth/grant-fields'
import { computed, defineAsyncComponent, toRaw, useModuleT, useNuxtApp } from '#imports'
import type { Component } from 'vue'
import type { Grant } from '../../utils/grants'

defineOptions({ name: 'GrantsEditor' })

// Edits a grant list: who may see a record. Any one grant admits; an empty list admits nobody. The editor owns only the
// list: each kind renders its own fields (`field` of `extendGrants`), with the grant as `v-model`.
const props = defineProps<{
  /** Only offer these kinds in the "Add" menu (a mailbox leaves out `public`). Grants already in the list stay. */
  kinds?: string[]
  disabled?: boolean
  /** The line shown while the list is empty, for a list that is not about who sees a record (a send's recipients). */
  emptyText?: string
  /** The "Add" button's label, for the same kind of list ("Add a group"). */
  addLabel?: string
}>()
const model = defineModel<Grant[]>({ default: () => [] })

const t = useModuleT('auth')
// A kind's `labelKey` is a full i18n key of the module that registers it (`teams.grants.team`).
const i18n = useNuxtApp().$i18n as { t: (key: string) => string, te?: (key: string) => boolean } | undefined
const translated = (key: string | undefined, fallback: string) => key && i18n?.te?.(key) ? i18n.t(key) : fallback

type Entry = (typeof grantFields)[number]
const fields = new Map<string, Entry>(grantFields.map(entry => [entry.kind, entry]))
const components = new Map<string, Component>()
function fieldOf(kind: string): Component | undefined {
  const entry = fields.get(kind)
  if (!entry?.field) return undefined
  if (!components.has(kind)) components.set(kind, defineAsyncComponent(entry.field))
  return components.get(kind)
}

const labelOf = (kind: string) => {
  const entry = fields.get(kind)
  return entry ? translated(entry.labelKey, entry.label) : kind
}

const addItems = computed(() => grantFields
  .filter(entry => !props.kinds || props.kinds.includes(entry.kind))
  // `public` once is enough: a second one changes nothing.
  .filter(entry => entry.kind !== 'public' || !model.value.some(grant => grant.kind === 'public'))
  .map(entry => ({
    label: translated(entry.labelKey, entry.label),
    icon: entry.icon,
    onSelect: () => {
      model.value = [...model.value, { ...structuredClone(entry.defaults ?? {}), kind: entry.kind }]
    },
  })))

// Each row keeps a stable key, so removing a grant does not hand its field component (and that component's local state)
// to the grant after it. Keys follow the grant object; an edited grant is a new object and inherits its row's key.
const rowKeys = new WeakMap<Grant, number>()
let nextRowKey = 0
function rowKey(grant: Grant): number {
  const raw = toRaw(grant)
  let key = rowKeys.get(raw)
  if (key === undefined) {
    key = nextRowKey++
    rowKeys.set(raw, key)
  }
  return key
}

function update(index: number, grant: Grant) {
  const next = [...model.value]
  const edited = { ...grant }
  rowKeys.set(edited, rowKey(next[index]!))
  next[index] = edited
  model.value = next
}

function remove(index: number) {
  model.value = model.value.filter((_, at) => at !== index)
}
</script>

<template>
  <div class="flex w-full flex-col gap-3">
    <p class="text-muted text-sm">
      {{ model.length
        ? t('grants.editor.any', 'Anyone who matches one of these sees it.')
        : emptyText ?? t('grants.editor.nobody', 'Nobody sees it yet: add who may.') }}
    </p>

    <div
      v-for="(grant, index) in model"
      :key="rowKey(grant)"
      class="border-default flex items-start gap-2 rounded-md border p-3"
    >
      <UIcon
        :name="fields.get(grant.kind)?.icon ?? 'i-lucide-key-round'"
        class="text-muted mt-1 size-4 shrink-0"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <span class="text-sm font-medium">{{ labelOf(grant.kind) }}</span>
        <component
          :is="fieldOf(grant.kind)"
          v-if="fieldOf(grant.kind)"
          :model-value="grant"
          :disabled="disabled"
          @update:model-value="(value: Grant) => update(index, value)"
        />
        <p
          v-else-if="!fields.has(grant.kind)"
          class="text-error text-sm"
        >
          {{ t('grants.editor.unknown', 'No installed module knows this kind, so it lets nobody in.') }}
        </p>
      </div>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="disabled"
        :aria-label="t('grants.editor.remove', 'Remove {kind}', { kind: labelOf(grant.kind) })"
        @click="remove(index)"
      />
    </div>

    <UDropdownMenu
      :items="addItems"
      :disabled="disabled || !addItems.length"
    >
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        class="self-start"
        :label="addLabel ?? t('grants.editor.add', 'Add who may see it')"
        :disabled="disabled || !addItems.length"
      />
    </UDropdownMenu>
  </div>
</template>
