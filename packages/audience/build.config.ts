import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/server',
  ],
  declaration: true,
  externals: ['h3', 'nitropack'],
  rollup: {
    inlineDependencies: false,
  },
})
