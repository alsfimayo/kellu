# Usage Guide
This repository provides a backend template using the Hono framework, designed to help you quickly set up a robust and scalable backend for your applications. Below are the key features and instructions on how to use this template effectively.
## Features
- **Hono Framework**: A lightweight and fast web framework for building APIs and web applications.
- **OpenAPI Integration**: Automatically generate and serve OpenAPI documentation for your API endpoints.
- **Zod Validation**: Use Zod schemas for request validation, ensuring data integrity and type safety.
- **Modular Structure**: Organized codebase with separate files for routes, middleware, and configuration.
- **TypeScript Support**: Fully typed codebase for better developer experience and maintainability
## How to create a new route
1. **Create a Route File**: In the `src/routes` directory, create a new folder for your route (e.g., `user`) and add an `index.ts` file inside it.Chaining is required for openapi to work properly.
```ts

import { createRouter } from '~/lib/create-app'
import { USER_ROUTE_HANDLER } from '~/routes/user/user.handler'
import { USER_ROUTES } from '~/routes/user/user.routes'
// this is necessary to map the routes type to their handlers.
const router = createRouter().openapi(USER_ROUTES.get_user, USER_ROUTE_HANDLER.get_user)
export default router
```
2. **Define Route Handlers**: Create a handler file (e.g., `user.handler.ts`) to define the logic for your route. Always use the `HandlerMapFromRoutes` type to ensure type safety.Also use object based export for handlers.
```ts
import type { TEST_ROUTES } from '~/routes/test/test.routes'
import type { HandlerMapFromRoutes } from '~/types'
// this type is necessary to map the routes type to their handlers.
export const TEST_ROUTE_HANDLER: HandlerMapFromRoutes<typeof TEST_ROUTES> = {
  get_test: async c => {
    return c.json({
      message: 'Test route is working!',
      data:{

      }


    })
  },
}

```

3. **Set Up Routes**: Create a routes file (e.g., `user.routes.ts`) to define the endpoints and their associated Zod schemas.
4. **Register the Route**: Import and register your new route in `src/app.ts` using the `registerRoutes` function. Chaining is required for openapi to work properly.

## Services
Services are used to interact with the database or perform business logic. Create a new file in the `src/services` directory for your service (e.g., `user.service.ts`).
Each table or model will have their own service file to keep things organized.

## Libs
Libs are utility functions or classes that can be reused across the application. Create a new file in the `src/lib` directory for your library (e.g., `auth.ts`).
## Zod Schemas
Zod Schema for models are being auto generated using Prisma and can be found in the `src/zod/models` directory. You can create additional Zod schemas for request validation in the `src/zod` directory.

## Stoker
Stoker is utility library to generate OpenAPI specs from Zod schemas. Most commonly used methods are:
- `jsonContentRequired`: It accepts a zod schema and a description message.It will validate zod schema and return 422 if validation fails.Also it will generate OpenAPI spec for the schema.

```tsx
import { z } from 'zod'
import { jsonContentRequired } from 'stoker'

const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().min(0).optional(),
})

const route = createRoute({
  request:{
    // it is specifically for request body validation.
    body: jsonContentRequired(userSchema, 'User object is required'),
  }
})

```
- `jsonContent`: Same as above but without validation.
```tsx
import { z } from 'zod'
import { jsonContent } from 'stoker'
const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().min(0).optional(),
})
const route = createRoute({
  request:{
    // it is specifically for request body validation.
    body: jsonContent(userSchema, 'User object is optional'),
  }
})
```
- `HttpStatus`: It has all the HTTP status codes as enum.
```tsx
import * as HttpStatusCodes from 'stoker/http-status-codes'

```
- `HttpPhrases`: It has all the HTTP status phrases as enum.
```tsx
import * as HttpPhrases from 'stoker/http-phrases'
```


## Error Handling
The template includes a centralized error handling mechanism. You can customize the error responses in the `src/middleware/error-handler.ts` file.
You can throw errors using the `HttpError` class. It can be used inside of services.
