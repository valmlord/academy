import createClient from 'openapi-fetch'
import type { paths } from './schema'

// On the server the page has no browser origin, so it calls the API at the absolute private `apiBase`; in the
// browser it goes through the same-origin /api proxy.
export function useApiClient() {
  const config = useRuntimeConfig()
  return createClient<paths>({ baseUrl: import.meta.server ? config.apiBase : '/api' })
}
