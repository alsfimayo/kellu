import { createRouter } from '~/lib/create-app'
import { CLIENT_HANDLER } from '~/routes/clients/client.handler'
import { CLIENT_ROUTES } from '~/routes/clients/client.routes'

const router = createRouter()
;(Object.keys(CLIENT_ROUTES) as Array<keyof typeof CLIENT_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(CLIENT_ROUTES[key], CLIENT_HANDLER[key] as any)
})

export default router
