<script setup lang="ts">
import type { Translated } from '@frigear-nu/ui/translated'
import type { AdminDocumentDto, DocumentAudience, DocumentListing, GroupOptionDto } from '../../../types'

const t = useModuleT('documents')
const route = useRoute()
const toast = useToast()
const confirm = useConfirmDialog()
const text = useDocumentText()
const paths = useDocumentsPaths()

const folderId = computed(() => typeof route.query.folder === 'string' ? route.query.folder : undefined)
const { data: listing, error, refresh } = await useFetch<DocumentListing<AdminDocumentDto>>('/api/documents/admin/items', {
  query: computed(() => ({ parent: folderId.value })),
})
const { data: groups } = await useFetch<GroupOptionDto[]>('/api/documents/admin/groups')
const groupItems = computed(() => (groups.value ?? []).map(group => ({ id: group.id, label: text(group.name) })))
const groupLabel = (id: string) => groupItems.value.find(group => group.id === id)?.label ?? id

const failure = (cause: unknown) => toast.add({
  title: (cause as { statusMessage?: string }).statusMessage ?? t('error.generic', 'Something went wrong. Please try again.'),
  color: 'error',
})

// --- Editor (new folder, upload, edit) -----------------------------------------------------
type Mode = 'folder' | 'upload' | 'edit'
const open = ref(false)
const mode = ref<Mode>('folder')
const editing = ref<AdminDocumentDto | null>(null)
const saving = ref(false)
const file = ref<File | null>(null)
const form = reactive<{ title: Translated | undefined, description: Translated | undefined, icon: string, audience: DocumentAudience, groupIds: string[] }>({
  title: undefined, description: undefined, icon: '', audience: 'groups', groupIds: [],
})

function openEditor(next: Mode, item?: AdminDocumentDto) {
  mode.value = next
  editing.value = item ?? null
  file.value = null
  form.title = item?.title
  form.description = item?.description ?? undefined
  form.icon = item?.icon ?? ''
  form.audience = item?.audience ?? 'groups'
  form.groupIds = [...(item?.groupIds ?? [])]
  open.value = true
}

const fields = () => ({
  title: form.title,
  description: form.description ?? null,
  icon: form.icon || null,
  audience: form.audience,
  groupIds: form.audience === 'groups' ? form.groupIds : [],
})

async function save() {
  saving.value = true
  try {
    if (mode.value === 'edit' && editing.value) {
      await $fetch(`/api/documents/admin/items/${editing.value.id}`, { method: 'PATCH', body: fields() })
    }
    else if (mode.value === 'folder') {
      await $fetch('/api/documents/admin/items', { method: 'POST', body: { ...fields(), parentId: folderId.value ?? null } })
    }
    else if (file.value) {
      const body = new FormData()
      body.append('file', file.value)
      body.append('meta', JSON.stringify({ ...fields(), title: form.title || undefined, parentId: folderId.value ?? null }))
      await $fetch('/api/documents/admin/items/upload', { method: 'POST', body })
    }
    open.value = false
    await refresh()
  }
  catch (cause) {
    failure(cause)
  }
  finally {
    saving.value = false
  }
}

async function remove(item: AdminDocumentDto) {
  const confirmed = await confirm({
    title: t('admin.deleteTitle', 'Delete "{title}"?', { title: text(item.title) }),
    description: item.kind === 'folder'
      ? t('admin.deleteFolderDescription', 'Everything inside this folder is deleted too.')
      : t('admin.deleteFileDescription', 'The file is deleted permanently.'),
    confirmText: t('admin.delete', 'Delete'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/documents/admin/items/${item.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (cause) {
    failure(cause)
  }
}

const breadcrumb = computed(() => [
  { label: t('admin.title', 'Documents'), to: paths('admin') },
  ...(listing.value?.breadcrumb ?? []).map(folder => ({ label: text(folder.title), to: { path: paths('admin'), query: { folder: folder.id } } })),
])

const columns = [
  { accessorKey: 'title', header: t('admin.name', 'Name') },
  { accessorKey: 'audience', header: t('admin.sharedWith', 'Shared with') },
  { id: 'actions', header: '' },
]
type Row = { original: AdminDocumentDto }
const openFolder = (_: Event, row: Row) => {
  if (row.original.kind === 'folder') navigateTo({ path: paths('admin'), query: { folder: row.original.id } })
}
</script>

<template>
  <AdminPage>
    <AdminPageHeader :title="t('admin.title', 'Documents')">
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-folder-plus"
          :label="t('admin.newFolder', 'New folder')"
          @click="openEditor('folder')"
        />
        <UButton
          icon="i-lucide-upload"
          :label="t('admin.upload', 'Upload')"
          @click="openEditor('upload')"
        />
      </template>
    </AdminPageHeader>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage documents.')"
    />
    <template v-else>
      <UBreadcrumb
        v-if="folderId"
        :items="breadcrumb"
      />
      <AdminTable
        :data="listing?.items ?? []"
        :columns="columns"
        @select="openFolder"
      >
        <template #title-cell="{ row }">
          <div class="flex items-center gap-3">
            <UIcon
              :name="row.original.icon ?? (row.original.kind === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text')"
              class="size-5 text-muted"
            />
            <div class="space-y-0.5">
              <p class="font-medium">
                {{ text(row.original.title) }}
              </p>
              <p
                v-if="row.original.kind === 'file'"
                class="text-sm text-muted"
              >
                {{ row.original.filename }} · {{ formatFileSize(row.original.size) }}
              </p>
            </div>
          </div>
        </template>
        <template #audience-cell="{ row }">
          <UBadge
            v-if="row.original.audience === 'everyone'"
            color="success"
            variant="subtle"
            :label="t('admin.everyone', 'Everyone')"
          />
          <div
            v-else-if="row.original.groupIds.length"
            class="flex flex-wrap gap-1"
          >
            <UBadge
              v-for="groupId in row.original.groupIds"
              :key="groupId"
              color="neutral"
              variant="subtle"
              :label="groupLabel(groupId)"
            />
          </div>
          <span
            v-else
            class="text-sm text-muted"
          >{{ t('admin.noone', 'Nobody yet') }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              v-if="row.original.kind === 'file'"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-download"
              download
              external
              :to="`/api/documents/${row.original.id}/download`"
              :aria-label="t('download', 'Download')"
              @click.stop
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-pencil"
              :aria-label="t('admin.edit', 'Edit')"
              @click.stop="openEditor('edit', row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-trash-2"
              :aria-label="t('admin.delete', 'Delete')"
              @click.stop="remove(row.original)"
            />
          </div>
        </template>
        <template #empty>
          <AdminEmpty
            icon="i-lucide-files"
            :title="t('admin.empty', 'Nothing here yet.')"
          />
        </template>
      </AdminTable>
    </template>

    <UModal
      v-model:open="open"
      :title="mode === 'upload' ? t('admin.upload', 'Upload') : mode === 'folder' ? t('admin.newFolder', 'New folder') : t('admin.edit', 'Edit')"
    >
      <template #body>
        <form
          id="documents-editor"
          class="space-y-4"
          @submit.prevent="save"
        >
          <UFormField
            v-if="mode === 'upload'"
            :label="t('admin.file', 'File')"
          >
            <UFileUpload
              v-model="file"
              class="min-h-32 w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.titleField', 'Title')">
            <TranslatedInput v-model="form.title" />
          </UFormField>
          <UFormField :label="t('admin.description', 'Description')">
            <TranslatedInput
              v-model="form.description"
              multiline
            />
          </UFormField>
          <UFormField :label="t('admin.icon', 'Icon')">
            <IconInput v-model="form.icon" />
          </UFormField>
          <UFormField :label="t('admin.sharedWith', 'Shared with')">
            <URadioGroup
              v-model="form.audience"
              :items="[
                { value: 'groups', label: t('admin.groups', 'Selected groups') },
                { value: 'everyone', label: t('admin.everyone', 'Everyone') },
              ]"
            />
          </UFormField>
          <UFormField
            v-if="form.audience === 'groups'"
            :label="t('admin.groups', 'Selected groups')"
          >
            <USelectMenu
              v-model="form.groupIds"
              multiple
              value-key="id"
              :items="groupItems"
              class="w-full"
              :placeholder="t('admin.pickGroups', 'Pick groups…')"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="subtle"
            color="neutral"
            :label="t('admin.cancel', 'Cancel')"
            @click="open = false"
          />
          <UButton
            type="submit"
            form="documents-editor"
            :label="t('admin.save', 'Save')"
            :loading="saving"
            :disabled="mode === 'upload' ? !file : !form.title"
          />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
