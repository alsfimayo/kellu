import { createRouter } from '~/lib/create-app'
import { WORK_ORDER_HANDLER } from '~/routes/workorders/workorder.handler'
import { WORK_ORDER_ROUTES } from '~/routes/workorders/workorder.routes'

const router = createRouter()
;(Object.keys(WORK_ORDER_ROUTES) as Array<keyof typeof WORK_ORDER_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(WORK_ORDER_ROUTES[key], WORK_ORDER_HANDLER[key] as any)
})

export default router
