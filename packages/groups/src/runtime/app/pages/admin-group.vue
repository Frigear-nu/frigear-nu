<script setup lang="ts">
import type { Translated } from '@frigear-nu/ui/translated'
import type { GroupDto, GroupMemberDto, GroupUserDto } from '../../../types'

const t = useModuleT('groups')
const paths = useGroupsPaths()
const toast = useToast()
const confirm = useConfirmDialog()
const route = useRoute()
const id = String(route.params.id)

const { data: group, error } = await useFetch<GroupDto>(`/api/groups/admin/groups/${id}`)
const { data: members, refresh: refreshMembers } = await useFetch<GroupMemberDto[]>(`/api/groups/admin/groups/${id}/members`)

const form = reactive<{ name: Translated | undefined, description: Translated | undefined, slug: string, icon: string }>({
  name: group.value?.name,
  description: group.value?.description ?? undefined,
  slug: group.value?.slug ?? '',
  icon: group.value?.icon ?? '',
})
const saving = ref(false)

const failure = (cause: unknown) => toast.add({
  title: (cause as { statusMessage?: string }).statusMessage ?? t('error.generic', 'Something went wrong. Please try again.'),
  color: 'error',
})

async function save() {
  saving.value = true
  try {
    group.value = await $fetch<GroupDto>(`/api/groups/admin/groups/${id}`, {
      method: 'PATCH',
      body: { name: form.name, description: form.description ?? null, slug: form.slug, icon: form.icon || null },
    })
    toast.add({ title: t('admin.saved', 'Saved.'), color: 'success' })
  }
  catch (cause) {
    failure(cause)
  }
  finally {
    saving.value = false
  }
}

async function remove() {
  const confirmed = await confirm({
    title: t('admin.deleteTitle', 'Delete this group?'),
    description: t('admin.deleteDescription', 'Members lose access to everything shared with this group. The users themselves are kept.'),
    confirmText: t('admin.delete', 'Delete'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/groups/admin/groups/${id}`, { method: 'DELETE' })
    await navigateTo(paths('admin'))
  }
  catch (cause) {
    failure(cause)
  }
}

// --- Members ---------------------------------------------------------------------------
const search = ref('')
const results = ref<GroupUserDto[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (query) => {
  clearTimeout(timer)
  if (!query.trim()) {
    results.value = []
    return
  }
  timer = setTimeout(async () => {
    try {
      results.value = await $fetch<GroupUserDto[]>('/api/groups/admin/users', { query: { q: query.trim() } })
    }
    catch (cause) {
      failure(cause)
    }
  }, 250)
})

const memberIds = computed(() => new Set((members.value ?? []).map(member => member.userId)))
const candidates = computed(() => results.value.filter(user => !memberIds.value.has(user.id)))

async function add(user: GroupUserDto) {
  try {
    await $fetch(`/api/groups/admin/groups/${id}/members`, { method: 'POST', body: { userId: user.id } })
    search.value = ''
    await refreshMembers()
  }
  catch (cause) {
    failure(cause)
  }
}

async function removeMember(member: GroupMemberDto) {
  try {
    await $fetch(`/api/groups/admin/groups/${id}/members/${member.userId}`, { method: 'DELETE' })
    await refreshMembers()
  }
  catch (cause) {
    failure(cause)
  }
}

const columns = [
  { accessorKey: 'name', header: t('admin.name', 'Name') },
  { accessorKey: 'email', header: t('admin.email', 'Email') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <AdminPage>
    <UAlert
      v-if="error || !group"
      color="error"
      variant="subtle"
      :title="t('admin.notFound', 'This group could not be found.')"
    />
    <template v-else>
      <AdminPageHeader
        :title="t('admin.edit', 'Edit group')"
        :back="{ label: t('admin.title', 'Groups'), to: paths('admin') }"
      >
        <template #actions>
          <UButton
            color="error"
            variant="subtle"
            icon="i-lucide-trash-2"
            :label="t('admin.delete', 'Delete')"
            @click="remove"
          />
        </template>
      </AdminPageHeader>

      <AdminSection :title="t('admin.details', 'Details')">
        <form
          id="admin-group-form"
          class="space-y-4"
          @submit.prevent="save"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <TranslatedInput v-model="form.name" />
          </UFormField>
          <UFormField :label="t('admin.description', 'Description')">
            <TranslatedInput
              v-model="form.description"
              multiline
            />
          </UFormField>
          <UFormField :label="t('admin.slug', 'Slug')">
            <UInput
              v-model="form.slug"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.icon', 'Icon')">
            <IconInput v-model="form.icon" />
          </UFormField>
        </form>
        <template #footer>
          <UButton
            type="submit"
            form="admin-group-form"
            :label="t('admin.save', 'Save')"
            :loading="saving"
          />
        </template>
      </AdminSection>

      <AdminSection :title="t('admin.members', 'Members')">
        <div class="space-y-3">
          <UInput
            v-model="search"
            class="w-full"
            icon="i-lucide-search"
            :placeholder="t('admin.searchUsers', 'Search users by name or email to add…')"
          />
          <ul
            v-if="candidates.length"
            class="divide-y divide-default rounded-md border border-default"
          >
            <li
              v-for="user in candidates"
              :key="user.id"
              class="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span class="min-w-0 truncate text-sm">{{ user.name }} <span class="text-muted">· {{ user.email }}</span></span>
              <UButton
                size="sm"
                variant="subtle"
                icon="i-lucide-plus"
                :label="t('admin.add', 'Add')"
                @click="add(user)"
              />
            </li>
          </ul>
        </div>
        <template #flush>
          <AdminTable
            :data="members ?? []"
            :columns="columns"
          >
            <template #actions-cell="{ row }">
              <div class="flex justify-end">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-x"
                  :aria-label="t('admin.remove', 'Remove')"
                  @click="removeMember(row.original)"
                />
              </div>
            </template>
            <template #empty>
              <AdminEmpty
                icon="i-lucide-users"
                :title="t('admin.noMembers', 'No members yet.')"
              />
            </template>
          </AdminTable>
        </template>
      </AdminSection>
    </template>
  </AdminPage>
</template>
