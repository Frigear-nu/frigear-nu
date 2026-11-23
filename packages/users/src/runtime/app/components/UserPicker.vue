<script setup lang="ts">
import { formBusInjectionKey, formFieldInjectionKey } from '@nuxt/ui/composables/useFormField'
import { authApi } from '@frigear-nu/auth/api'
import { usersApi } from '../../utils/api'
import type { UserPickerCreateInitial, UserPickerOption } from '../../../types'
import type { UserCreateResult } from '../utils/admin-user'
import UserCreateSlideover from './UserCreateSlideover.vue'
import { computed, inject, nextTick, onBeforeUnmount, ref, useLazyFetch, useModuleT, useOverlay, watch } from '#imports'

defineOptions({ name: 'UserPicker' })

/**
 * The one user picker of the app: a search by name (and by email where the route lets the caller see emails), single
 * (`v-model` a user id) or `multiple` (an array of ids). `endpoint` is the search route (`GET ?q=`, answering
 * `UserPickerOption[]` or a page with `items`); it defaults to the users admin list (`users:list`), and a module whose
 * staff lack that permission passes its own (teams: `teams:manage`, emails with `teams:pii`).
 *
 * With `users:create` (and `create` not `false`) a "Create user" option opens the create form, prefilled from the
 * search; the created user is selected. A taken email offers the user who has it instead. `selected` gives the names of
 * ids the model already holds.
 */
const props = withDefaults(defineProps<{
  endpoint?: string
  multiple?: boolean
  create?: boolean
  selected?: UserPickerOption[]
  placeholder?: string
  disabled?: boolean
}>(), { endpoint: undefined, multiple: false, create: true, selected: () => [], placeholder: undefined, disabled: false })
const model = defineModel<number | number[] | null | undefined>()
// `picked`: a user was selected (or added, with `multiple`), with what the picker knows of them; `created`: one was created.
const emit = defineEmits<{ picked: [user: UserPickerOption], created: [user: UserPickerOption] }>()

const t = useModuleT('users')
const overlay = useOverlay()

// Whether the viewer may create users: the exact permission list of `GET /api/auth/me/access` (the API decides).
const { data: access } = useLazyFetch<{ permissions?: string[] }>(authApi.me.access, {
  key: 'users:picker-access',
  server: false,
  immediate: props.create,
  default: () => ({ permissions: [] }),
  onResponseError: () => {},
})
const canCreate = computed(() => props.create && !!access.value?.permissions?.includes('users:create'))

const search = ref('')
// Bumped when the create form picks a user: the input remounts showing the selection, not the old search.
const renderKey = ref(0)
// The search term, 250 ms after the last keystroke.
const q = ref('')
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    q.value = value
  }, 250)
})
onBeforeUnmount(() => clearTimeout(debounce))
const { data: found, status, execute } = useLazyFetch<UserPickerOption[] | { items: UserPickerOption[] }>(() => props.endpoint ?? usersApi.admin.users, {
  query: computed(() => ({ q: q.value.trim(), pageSize: 20 })),
  immediate: false,
  watch: false,
  default: () => [],
  onResponseError: () => {},
})
// Searches only for a term: an empty one would list everyone (or be refused by a route that requires `q`).
watch(q, (term) => {
  if (term.trim()) void execute()
})

// Names of every user shown so far, so a selected id keeps its label while the search changes.
const known = ref(new Map<number, UserPickerOption>())
const remember = (users: UserPickerOption[]) => {
  for (const user of users) known.value.set(user.id, user)
}
watch(() => props.selected, users => remember(users ?? []), { immediate: true })

const results = computed<UserPickerOption[]>(() => {
  if (!q.value.trim()) return []
  const data = found.value
  return Array.isArray(data) ? data : (data?.items ?? [])
})
watch(results, remember)

type Item = { label: string, description?: string, avatar?: { src: string }, value: number }
const toItem = (user: UserPickerOption): Item => ({
  label: user.name || user.email || `#${user.id}`,
  description: user.email ?? undefined,
  avatar: user.avatar ? { src: user.avatar } : undefined,
  value: user.id,
})
const optionOf = (id: number) => known.value.get(id) ?? { id, name: null }

const items = computed(() => results.value.map(toItem))
// The input works on whole items (labels stay when the search changes); the model holds ids.
const current = computed<Item | Item[] | undefined>({
  get: () => {
    if (props.multiple) return (Array.isArray(model.value) ? model.value : []).map(id => toItem(optionOf(id)))
    return typeof model.value === 'number' ? toItem(optionOf(model.value)) : undefined
  },
  set: (value) => {
    if (props.multiple) {
      const before = Array.isArray(model.value) ? model.value : []
      const ids = (Array.isArray(value) ? value : []).map(item => item.value)
      model.value = ids
      for (const id of ids.filter(id => !before.includes(id))) emit('picked', optionOf(id))
      return
    }
    model.value = value && !Array.isArray(value) ? value.value : undefined
    if (typeof model.value === 'number') emit('picked', optionOf(model.value))
  },
})

// A selection made in code (from the create form: the created user, or the existing one it offered) is no input event of
// the menu, so the enclosing `UFormField` would keep a "choose a person" error until submit: report it as a change, which
// revalidates the field. (Not `useFormField`: it hides the field from the menu inside.)
const formBus = inject(formBusInjectionKey, undefined)
const formField = inject(formFieldInjectionKey, undefined)
const notifyFormField = () => nextTick(() => {
  const name = formField?.value?.name
  if (formBus && name) formBus.emit({ type: 'change', name })
})

const select = (user: UserPickerOption) => {
  remember([user])
  if (props.multiple) {
    const ids = Array.isArray(model.value) ? model.value : []
    if (!ids.includes(user.id)) model.value = [...ids, user.id]
  }
  else {
    model.value = user.id
  }
  emit('picked', user)
  search.value = ''
  renderKey.value++
  void notifyFormField()
}

/**
 * Opens the create form prefilled with `initial` and selects the created user (or the existing one a taken email
 * offers). Resolves with the selected user, or `null` when cancelled or not allowed. Exposed, so a host that knows the
 * person (an inbox contact) can offer "Create user" before anything is typed.
 */
async function openCreate(initial: UserPickerCreateInitial = {}): Promise<UserPickerOption | null> {
  if (!canCreate.value) return null
  const result = await overlay.create(UserCreateSlideover, { destroyOnClose: true })
    .open({ initial, verify: false, offerExisting: true }).result as UserCreateResult
  if (!result) return null
  if ('existing' in result) {
    select(result.existing)
    return result.existing
  }
  const user = { id: result.id, name: result.name, email: result.email, avatar: result.avatar }
  select(user)
  emit('created', user)
  return user
}

async function createUser(term: string) {
  const value = term.trim()
  await openCreate(value.includes('@') ? { email: value } : { name: value })
}

defineExpose({ openCreate, canCreate })
</script>

<template>
  <UInputMenu
    :key="renderKey"
    v-model="current"
    v-model:search-term="search"
    :items="items"
    :multiple="multiple"
    by="value"
    ignore-filter
    :create-item="canCreate ? { position: 'bottom', when: 'always' } : false"
    :loading="status === 'pending'"
    :disabled="disabled"
    icon="i-lucide-search"
    :placeholder="placeholder ?? t('picker.placeholder', 'Search people')"
    class="w-full"
    data-user-picker
    @create="createUser"
  >
    <template #create-item-label="{ item }">
      <span class="inline-flex items-center gap-1.5">
        <UIcon
          name="i-lucide-user-plus"
          class="size-4 shrink-0"
        />
        {{ t('picker.create', 'Create user "{term}"', { term: item }) }}
      </span>
    </template>
    <template #empty>
      {{ q.trim() ? t('picker.empty', 'Nobody matches') : t('picker.hint', 'Type a name to search') }}
    </template>
  </UInputMenu>
</template>
