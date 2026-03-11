import { OpenAPIHono } from '@hono/zod-openapi'
import { notFound } from 'stoker/middlewares'

import onError from '~/middleware/error-middleware'
import { customLogger } from '~/middleware/pino-logger'
import type { AppBindings } from '~/types'

export function createRouter() {
  return new OpenAPIHono<AppBindings>({
    strict: false,
    defaultHook: (result, c) => {
      if (result.success) {
        return
      }
      console.log(result)

      return c.json({ success: false, errors: result.error.issues }, { status: 400 })
    },
  })
}

export default function createApp() {
  const app = createRouter()
  app.use(customLogger())
  app.notFound(notFound)
  app.onError(onError)
  return app
}
