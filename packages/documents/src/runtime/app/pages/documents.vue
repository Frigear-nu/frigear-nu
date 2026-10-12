<script setup lang="ts">
import type { DocumentListing } from '../../../types'

defineOptions({ name: 'DocumentsPage' })

const t = useModuleT('documents')
const route = useRoute()
const text = useDocumentText()
const paths = useDocumentsPaths()

const folderId = computed(() => typeof route.query.folder === 'string' ? route.query.folder : undefined)
const { data: listing, error } = await useFetch<DocumentListing>('/api/documents', {
  query: computed(() => ({ parent: folderId.value })),
})

const breadcrumb = computed(() => [
  { label: t('title', 'Documents'), to: paths('documents') },
  ...(listing.value?.breadcrumb ?? []).map(folder => ({ label: text(folder.title), to: { path: paths('documents'), query: { folder: folder.id } } })),
])
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="t('notFound', 'This folder could not be found.')"
        />
        <template v-else>
          <UBreadcrumb
            v-if="folderId"
            :items="breadcrumb"
            class="mb-4"
          />
          <UPageGrid v-if="listing?.items.length">
            <UPageCard
              v-for="item in listing.items"
              :key="item.id"
              :title="text(item.title)"
              :description="text(item.description)"
              :icon="item.icon ?? (item.kind === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text')"
              :to="item.kind === 'folder' ? { path: paths('documents'), query: { folder: item.id } } : undefined"
            >
              <UButton
                v-if="item.kind === 'file'"
                download
                external
                :to="`/api/documents/${item.id}/download`"
                icon="i-lucide-download"
                :label="t('download', 'Download')"
              />
              <span
                v-if="item.kind === 'file' && item.size"
                class="ml-2 text-sm text-muted"
              >{{ formatFileSize(item.size) }}</span>
            </UPageCard>
          </UPageGrid>
          <UEmpty
            v-else
            :title="t('empty', 'No documents for you yet.')"
          />
        </template>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
