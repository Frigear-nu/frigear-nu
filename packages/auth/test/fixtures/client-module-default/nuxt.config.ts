import AuthModule from '../../../src/module'

// No `authentication.mode` here: only the module in `modules/` asks for client mode, through a dependency default.
export default defineNuxtConfig({
  modules: [AuthModule, './modules/client-default'],
})
