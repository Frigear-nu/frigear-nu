<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffHelpCategory } from '../utils/admin'
import { computed, emptyCell, h, resolveComponent, tableUi, useHelpCategoryActions, useHelpCenterTranslate, useModuleT } from '#imports'

defineOptions({ name: 'HelpAdminCategories' })

// The categories tab of the admin page: every category as a tree (subcategories under their parent), with how many
// articles each has and who can see it.
const props = defineProps<{ categories: StaffHelpCategory[], loading?: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const actions = useHelpCategoryActions()

type Row = StaffHelpCategory & { depth: number }

// Parents first, each followed by its children; a category whose parent is gone counts as top level.
const rows = computed<Row[]>(() => {
  const ids = new Set(props.categories.map(category => category.id))
  const ordered: Row[] = []
  const visit = (parentId: string | null, depth: number, seen: Set<string>) => {
    for (const category of props.categories.filter(entry => (entry.parentId && ids.has(entry.parentId) ? entry.parentId : null) === parentId)) {
      if (seen.has(category.id)) continue
      ordered.push({ ...category, depth })
      visit(category.id, depth + 1, new Set([...seen, category.id]))
    }
  }
  visit(null, 0, new Set())
  return ordered
})

const DISPLAY_FALLBACKS: Record<string, string> = { list: 'Article list', accordion: 'Questions (FAQ)', cards: 'Question cards (FAQ)' }

const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')

const grantsLabel = (category: StaffHelpCategory) => category.public
  ? t('admin.grantsPublic', 'Public')
  : category.grants.length ? t('admin.grantsRestricted', 'Restricted') : t('admin.grantsNobody', 'Nobody yet')

const columns = computed<TableColumn<Row>[]>(() => [
  {
    id: 'name',
    header: t('admin.categoryName', 'Name'),
    cell: ({ row }) => h('div', { style: { paddingLeft: `${row.original.depth * 1.5}rem` } }, [
      h(TableIdentity, { title: tr(row.original.name), description: row.original.slug }),
    ]),
  },
  {
    id: 'articles',
    header: t('admin.articles', 'Articles'),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, String(row.original.articleCount)),
  },
  {
    id: 'display',
    header: t('admin.display', 'Shown as'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, t(`admin.displays.${row.original.display}`, DISPLAY_FALLBACKS[row.original.display] ?? 'Article list')),
  },
  {
    id: 'grants',
    header: t('admin.grantsLabel', 'Who can see it'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, grantsLabel(row.original)),
  },
  {
    id: 'owner',
    header: t('admin.owner', 'Owner'),
    cell: ({ row }) => row.original.owner.type === 'platform'
      ? emptyCell()
      : h('span', { class: 'text-muted' }, `${t(`admin.ownerTypes.${row.original.owner.type}`, row.original.owner.type)}: ${row.original.owner.id}`),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { categories: () => props.categories, onChanged: () => emit('changed') }), subject: tr(row.original.name) }),
  },
])

async function create() {
  if (await actions.create(props.categories)) emit('changed')
}
</script>

<template>
  <TableCard
    :title="t('admin.categories', 'Categories')"
    :loading="loading"
  >
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        :label="t('admin.createCategory', 'Add category')"
        @click="create"
      />
    </template>
    <UTable
      :data="rows"
      :columns="columns"
      :ui="tableUi()"
      data-test="help-admin-categories"
    >
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-lucide-folder-open"
          :title="t('admin.categoriesEmpty', 'No categories yet')"
          :description="t('admin.categoriesEmptyDescription', 'Add a category, such as safety or onboarding, and file articles in it.')"
          :actions="[{ label: t('admin.createCategory', 'Add category'), icon: 'i-lucide-plus', onClick: create }]"
        />
      </template>
    </UTable>
  </TableCard>
</template>
