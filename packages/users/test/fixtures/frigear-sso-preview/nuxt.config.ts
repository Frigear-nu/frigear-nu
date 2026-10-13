import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
  ],
  runtimeConfig: {
    previewDeployment: true,
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  users: {
    mode: 'server',
    settings: {
      oauth: { frigear: true },
    },
  },
})
