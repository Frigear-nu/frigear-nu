<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { HelpProgressRow, HelpProgressSummary } from '../../../types'
import { moveItem } from '../utils/checklist'
import type { StaffHelpArticle, StaffHelpArticlesPage, StaffHelpChecklist } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { $fetch, computed, emptyCell, errorMessage, h, ref, resolveComponent, tableUi, useAction, useFetch, useFormat, useHelpCenterPaths, useHelpCenterTranslate, useHelpChecklistActions, useModuleT, useRoute, useTableQuery, useTableSort, watch } from '#imports'

defineOptions({ name: 'HelpCenterAdminChecklistPage' })

// One checklist (`<admin>/checklists/:id`): the articles people have to read, in order, and who has read them. The
// progress needs `help-center:pii`; without it the section says so instead of showing people.
const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const format = useFormat()
const route = useRoute()
const paths = useHelpCenterPaths()
const actions = useHelpChecklistActions()
const { busy, run } = useAction()
const id = computed(() => String(route.params.id))

const { data: checklist, error, refresh } = await useFetch<StaffHelpChecklist>(() => helpCenterApi.admin.checklist(id.value))
const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

// The builder works on a copy and saves the whole list in order. Items that come from the `checklist` frontmatter of
// a Nuxt Content article are not part of it: they follow the files.
type BuilderItem = { articleId: string, required: boolean, title: string }
const items = ref<BuilderItem[]>([])
const readItems = (value: StaffHelpChecklist | null | undefined): BuilderItem[] => (value?.items ?? [])
  .filter(item => !item.fromContent)
  .map(item => ({ articleId: item.articleId, required: item.required, title: item.article ? tr(item.article.title) : item.articleId }))
items.value = readItems(checklist.value)
watch(checklist, value => (items.value = readItems(value)))
const contentItems = computed(() => (checklist.value?.items ?? []).filter(item => item.fromContent))

const { data: articlePage } = useFetch<StaffHelpArticlesPage>(helpCenterApi.admin.articles, {
  query: { status: 'published', pageSize: 100, sort: 'title', order: 'asc' },
  key: 'help-center:checklist:articles',
})
const available = computed(() => (articlePage.value?.items ?? [] as StaffHelpArticle[])
  .filter(article => !items.value.some(item => item.articleId === article.id) && !contentItems.value.some(item => item.articleId === article.id))
  .map(article => ({ value: article.id, label: tr(article.title) })))
const picked = ref<string | undefined>()
function add(articleId: string | undefined) {
  const article = articlePage.value?.items.find(entry => entry.id === articleId)
  if (!article) return
  items.value.push({ articleId: article.id, required: true, title: tr(article.title) })
  picked.value = undefined
}

async function save() {
  const saved = await run(
    () => $fetch<StaffHelpChecklist>(helpCenterApi.admin.checklist(id.value), {
      method: 'PATCH',
      body: { items: items.value.map(item => ({ articleId: item.articleId, required: item.required })) },
    }).then(() => true),
    { success: t('admin.checklistItemsSaved', 'Saved the articles of the checklist') },
  )
  if (saved) await refresh()
}

// --- Progress -----------------------------------------------------------------------------------

type ProgressPage = { items: HelpProgressRow[], total: number, page: number, pageSize: number } & HelpProgressSummary
const { page, pageSize, search, sort: sortState, query } = useTableQuery({ sort: { id: 'readCount', desc: false } })
const { sorting, header } = useTableSort(null, sortState)
const { data: progress, status: progressStatus, error: progressError, refresh: refreshProgress } = await useFetch<ProgressPage>(
  () => helpCenterApi.admin.progress(id.value),
  { query, key: () => `help-center:admin:progress:${id.value}`, onResponseError: () => {} },
)
const progressForbidden = computed(() => progressError.value?.statusCode === 403 || progressError.value?.statusCode === 401)
const progressRows = computed(() => progress.value?.items ?? [])
const progressLoading = computed(() => progressStatus.value === 'pending' && !progress.value)
const progressRefreshing = computed(() => progressStatus.value === 'pending' && !!progress.value)

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const columns = computed<TableColumn<HelpProgressRow>[]>(() => [
  {
    id: 'name',
    header: header('name', t('admin.person', 'Person')),
    cell: ({ row }) => h(TableIdentity, { title: row.original.user.name ?? row.original.user.email ?? row.original.user.id, description: row.original.user.name ? row.original.user.email ?? undefined : undefined }),
  },
  {
    id: 'readCount',
    header: header('readCount', t('admin.progressRead', 'Read')),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, t('admin.progressCount', '{read} of {total} required', { read: row.original.requiredReadCount, total: progress.value?.requiredCount ?? 0 })),
  },
  {
    id: 'status',
    header: t('admin.status', 'Status'),
    cell: ({ row }) => h(StatusBadge, {
      status: row.original.completed ? 'completed' : 'pending',
      label: row.original.completed ? t('admin.progressDone', 'Finished') : t('admin.progressOpen', 'Not finished'),
    }),
  },
  {
    id: 'lastReadAt',
    header: header('lastReadAt', t('admin.progressLast', 'Last read')),
    cell: ({ row }) => row.original.lastReadAt ? h('span', { class: 'text-muted tabular-nums' }, format.date(row.original.lastReadAt)) : emptyCell(),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="checklist">
      <PageHeading
        :title="tr(checklist.name)"
        :breadcrumb="[{ label: t('admin.title', 'Help center'), to: paths.admin() }, { label: tr(checklist.name) }]"
      >
        <template #actions>
          <RowMenu
            variant="outline"
            :subject="tr(checklist.name)"
            :items="actions.menu(checklist, { open: false, onChanged: refresh })"
          />
        </template>
      </PageHeading>

      <SectionCard
        :title="t('admin.checklistArticles', 'Articles')"
        :description="t('admin.checklistArticlesDescription', 'In this order. People mark an article as read by opening it.')"
      >
        <div class="flex flex-col gap-3">
          <ul
            v-if="items.length || contentItems.length"
            class="divide-default flex flex-col divide-y"
            data-test="help-checklist-items"
          >
            <li
              v-for="(item, index) in items"
              :key="item.articleId"
              class="flex items-center gap-3 py-2"
            >
              <span class="text-highlighted min-w-0 flex-1 truncate text-sm">{{ item.title }}</span>
              <USwitch
                v-model="item.required"
                :label="t('admin.required', 'Required')"
              />
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-arrow-up"
                :disabled="index === 0"
                :aria-label="t('admin.moveUp', 'Move up')"
                @click="items = moveItem(items, index, index - 1)"
              />
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-arrow-down"
                :disabled="index === items.length - 1"
                :aria-label="t('admin.moveDown', 'Move down')"
                @click="items = moveItem(items, index, index + 1)"
              />
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-trash-2"
                :aria-label="t('admin.removeFromChecklist', 'Remove from the checklist')"
                @click="items.splice(index, 1)"
              />
            </li>
            <li
              v-for="item in contentItems"
              :key="item.id"
              class="flex items-center gap-3 py-2"
            >
              <span class="text-highlighted min-w-0 flex-1 truncate text-sm">{{ item.article ? tr(item.article.title) : item.articleId }}</span>
              <UBadge
                variant="outline"
                color="neutral"
                :label="t('admin.fromContent', 'From a content file')"
              />
            </li>
          </ul>
          <UEmpty
            v-else
            variant="naked"
            icon="i-lucide-list-checks"
            :title="t('admin.checklistEmpty', 'No articles on this checklist yet')"
            :description="t('admin.checklistEmptyDescription', 'Pick the articles people have to read.')"
          />
          <USelectMenu
            v-model="picked"
            :items="available"
            value-key="value"
            class="w-full sm:max-w-sm"
            :placeholder="t('admin.addArticleToChecklist', 'Add an article')"
            @update:model-value="add"
          />
        </div>
        <template #footer>
          <div class="flex justify-end">
            <UButton
              :loading="busy"
              :label="t('admin.saveChecklistItems', 'Save articles')"
              @click="save"
            />
          </div>
        </template>
      </SectionCard>

      <UEmpty
        v-if="progressForbidden"
        icon="i-lucide-lock"
        :title="t('admin.progressForbidden', 'You cannot see who read what')"
        :description="t('admin.progressForbiddenDescription', 'It needs the help-center:pii permission, which no wildcard grants.')"
      />
      <template v-else>
        <PageToolbar>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :placeholder="t('admin.searchPeople', 'Search people')"
            :aria-label="t('admin.searchPeople', 'Search people')"
            class="w-full sm:max-w-xs"
          />
        </PageToolbar>
        <TableCard
          :title="t('admin.progress', 'Who has read what')"
          :description="t('admin.progressDescription', 'People who have started, and the ones the checklist\'s operation names. Unfinished first.')"
          :loading="progressLoading"
          :refreshing="progressRefreshing"
        >
          <template #actions>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-refresh-cw"
              :aria-label="t('tryAgain', 'Try again')"
              @click="() => refreshProgress()"
            />
          </template>
          <UTable
            v-model:sorting="sorting"
            :data="progressRows"
            :columns="columns"
            :sorting-options="{ manualSorting: true }"
            :ui="tableUi()"
            data-test="help-progress"
          >
            <template #empty>
              <UEmpty
                variant="naked"
                icon="i-lucide-users"
                :title="t('admin.progressEmpty', 'Nobody has started yet')"
              />
            </template>
          </UTable>
          <template #footer>
            <TablePagination
              v-model:page="page"
              v-model:page-size="pageSize"
              :total="progress?.total ?? 0"
            />
          </template>
        </TableCard>
      </template>
    </template>

    <UEmpty
      v-else-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbidden', 'You do not have access to the help center')"
      :actions="[{ label: t('admin.title', 'Help center'), to: paths.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else-if="notFound || !error"
      icon="i-lucide-list-checks"
      :title="t('admin.checklistNotFound', 'Checklist not found')"
      :actions="[{ label: t('admin.title', 'Help center'), to: paths.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else
      icon="i-lucide-circle-alert"
      :title="t('admin.checklistLoadFailed', 'The checklist could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
