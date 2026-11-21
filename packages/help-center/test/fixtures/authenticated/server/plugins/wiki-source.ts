import { defineHelpCenterSource } from '../../../../../src/runtime/server/source'

// A source of the host next to the database (`sources: ['database', 'wiki']`), the way Nuxt Content is one: its articles
// are public, it is read-only, and (the fixture sets precedence: wiki) it wins a clash of slugs.
const articles = [
  // Public, in an open category.
  { id: 'wiki:guides/parking', slug: 'wiki-parking', categorySlug: 'wiki-guides', title: { da: 'Parkering', en: 'Parking' }, body: { da: 'Parkér ved porten.', en: 'Park at the gate.' } },
  // Shares its slug with a database article: the wiki one is shown (the fixture sets precedence: wiki).
  { id: 'wiki:clash', slug: 'shared-slug', categorySlug: 'wiki-guides', title: { da: 'Fra wiki', en: 'From the wiki' }, body: { da: 'Wiki.', en: 'Wiki.' } },
  // Public, but filed in the restricted database category `wiki-staff`: hidden in that category's listing, still readable by its URL.
  { id: 'wiki:staff-note', slug: 'wiki-staff-note', categorySlug: 'wiki-staff', title: { da: 'Note til crew', en: 'Crew note' }, body: { da: 'Åben note.', en: 'Open note.' } },
].map(article => ({ ...article, source: 'wiki', public: true, sort: 0, publishedAt: null, updatedAt: null }))

export default defineNitroPlugin(() => {
  registerHelpCenterSource(defineHelpCenterSource({
    id: 'wiki',
    readOnly: true,
    list: ({ q, category }) => articles
      .filter(article => !category || article.categorySlug === category)
      .filter(article => !q || JSON.stringify([article.title, article.body]).toLocaleLowerCase().includes(q.toLocaleLowerCase())),
    get: slug => articles.find(article => article.slug === slug),
    getById: id => articles.find(article => article.id === id),
    categories: () => [...new Set(articles.map(article => article.categorySlug))].map(slug => ({
      id: `wiki-category:${slug}`, slug, name: slug, description: null, parentId: null, sort: 900, public: true, source: 'wiki', faqGroups: [], visible: true,
    })),
  }))
})
