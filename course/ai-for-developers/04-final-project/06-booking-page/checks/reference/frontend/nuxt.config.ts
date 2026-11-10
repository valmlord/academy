// The booking page of the calendar.
//
// CALENDAR_API_URL is read here, at build time: Nitro route rules, `proxy` included, are fixed in the build
// output, and at serve time the environment overrides only declared runtimeConfig keys (NUXT_ + key path).
// So the /api proxy target comes from the build, and the server-side fetch reads the private `apiBase`, which
// `make serve-web` sets again through NUXT_API_BASE.
const apiUrl = process.env.CALENDAR_API_URL ?? 'http://127.0.0.1:8080'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  modules: ['@nuxt/test-utils/module'],
  runtimeConfig: {
    apiBase: apiUrl,
  },
  routeRules: {
    '/api/**': { proxy: `${apiUrl}/**` },
  },
})
