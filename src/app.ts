import businessRouter from '~/routes/business'
import clientRouter from '~/routes/clients'
import workorderRouter from '~/routes/workorders'
import router from '~/routes/test'
import type { AppOpenAPI } from '~/types'

export function registerRoutes(app: AppOpenAPI) {
  return app.route('/test', router)
  .route('/api/businesses', businessRouter)
  .route('/api/clients', clientRouter)
  .route('/api/workorders', workorderRouter)
}
