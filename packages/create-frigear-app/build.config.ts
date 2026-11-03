import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { input: 'src/bin', name: 'cli' },
    'src/index',
  ],
  declaration: true,
  rollup: {
    inlineDependencies: false,
  },
})
