<script setup lang="ts">
import { translate } from '@frigear-nu/ui/translated'
import type { Translated } from '@frigear-nu/ui/translated'
import type { GroupDto } from '../../../types'
import { slugify } from '../../utils'

const t = useModuleT('groups')
const paths = useGroupsPaths()
const toast = useToast()
const locale = useTranslatedLocale()
const fallback = useTranslatedFallbackLocale()
const { data: groups, error } = await useFetch<GroupDto[]>('/api/groups/admin/groups')

const creating = ref(false)
const draft = reactive<{ name: Translated | undefined, slug: string, icon: string }>({ name: undefined, slug: '', icon: '' })
const label = (value: Translated | null | undefined) => translate(value, locale.value, fallback.value)

watch(() => label(draft.name), (name, previous) => {
  if (draft.slug === slugify(previous)) draft.slug = slugify(name)
})

async function create() {
  try {
    const created = await $fetch<GroupDto>('/api/groups/admin/groups', {
      method: 'POST',
      body: { name: draft.name, slug: draft.slug, icon: draft.icon || null },
    })
    await navigateTo(paths('adminGroup', { id: created.id }))
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('error.generic', 'Something went wrong. Please try again.'), color: 'error' })
  }
}

type Row = { original: GroupDto }
const columns = [
  { accessorKey: 'name', header: t('admin.name', 'Name') },
  { accessorKey: 'memberCount', header: t('admin.members', 'Members') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <AdminPage>
    <AdminPageHeader :title="t('admin.title', 'Groups')">
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.new', 'New group')"
          @click="creating = true"
        />
      </template>
    </AdminPageHeader>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage groups.')"
    />

    <AdminTable
      v-else
      :data="groups ?? []"
      :columns="columns"
      @select="(_: Event, row: Row) => navigateTo(paths('adminGroup', { id: row.original.id }))"
    >
      <template #name-cell="{ row }">
        <div class="flex items-center gap-3">
          <UIcon
            :name="row.original.icon || 'i-lucide-users'"
            class="size-5 text-muted"
          />
          <div class="space-y-0.5">
            <p class="font-medium">
              {{ label(row.original.name) }}
            </p>
            <p class="text-sm text-muted">
              {{ row.original.slug }}
            </p>
          </div>
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-pencil"
            :to="paths('adminGroup', { id: row.original.id })"
            :aria-label="t('admin.edit', 'Edit')"
            @click.stop
          />
        </div>
      </template>
      <template #empty>
        <AdminEmpty
          icon="i-lucide-users-round"
          :title="t('admin.empty', 'No groups yet.')"
        />
      </template>
    </AdminTable>

    <UModal
      v-model:open="creating"
      :title="t('admin.new', 'New group')"
    >
      <template #body>
        <form
          id="admin-group-create"
          class="space-y-4"
          @submit.prevent="create"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <TranslatedInput v-model="draft.name" />
          </UFormField>
          <UFormField
            :label="t('admin.slug', 'Slug')"
            :description="t('admin.slugHint', 'A short, stable identifier.')"
          >
            <UInput
              v-model="draft.slug"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.icon', 'Icon')">
            <IconInput v-model="draft.icon" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="subtle"
            color="neutral"
            :label="t('admin.cancel', 'Cancel')"
            @click="creating = false"
          />
          <UButton
            type="submit"
            form="admin-group-create"
            :label="t('admin.create', 'Create')"
            :disabled="!label(draft.name) || !draft.slug"
          />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
