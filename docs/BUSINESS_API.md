# Business API – Documentation & Testing

**Route folder:** `src/routes/business`  
**Base path:** `/api/businesses`  
**Service:** `src/services/business.service.ts`

All endpoints require **authentication** (session cookie or auth header).  
Base URL: `http://localhost:8000` (or your server).

---

## Module files

| File | Purpose |
|------|--------|
| `business.routes.ts` | OpenAPI route definitions, request/response schemas (BusinessSchema, CreateBusinessBodySchema, etc.) |
| `business.handler.ts` | Handlers: auth check, call business.service; createBusiness restricted to SUPER_ADMIN |
| `index.ts` | Registers all business routes with the router |

---

## Endpoints

| Method | Path | Summary |
|--------|------|---------|
| GET | `/` | List businesses (query: search, status, page, limit) |
| GET | `/{id}` | Get business by ID |
| POST | `/` | Create business **(Super Admin only)** |
| PATCH | `/{id}` | Update business |
| PATCH | `/{id}/commission` | Update commission (stub) |
| GET | `/{id}/clients` | Get business clients |
| GET | `/{id}/jobs` | Get business work orders/jobs |
| GET | `/{id}/clients-with-jobs` | Clients with work order count |
| PATCH | `/{id}/status` | Toggle business status |
| POST | `/{id}/suspend` | Suspend business |
| POST | `/{id}/unsuspend` | Unsuspend business |
| POST | `/{id}/send-email` | Send email to business |
| POST | `/{id}/reminder` | Send reminder to business |

---

## 1. List businesses

**Endpoint:** `GET /api/businesses`

**Query (optional):** `search`, `status`, `page`, `limit`

**Example:** `GET http://localhost:8000/api/businesses?page=1&limit=10`

**What to check:**

- `data` array of businesses with `id`, `companyName`, `email`, `status`, `totalJobs`, `revenue`, `users`, `owner`, `contactInfo`
- `pagination`: `page`, `limit`, `total`, `totalPages`

---

## 2. Get business by ID

**Endpoint:** `GET /api/businesses/{id}`

**What to check:**

- `data.id`, `data.companyName`, `data.email`, `data.owner`, `data.totalJobs`, `data.revenue`, `data.users`, `data.contactInfo`
- 404 if business not found

---

## 3. Create business (Super Admin only)

**Endpoint:** `POST /api/businesses`

**Purpose:** Creates a new business and owner user. Only users with role `SUPER_ADMIN` can call this.

**Request body (JSON):**

```json
{
  "companyName": "Acme Corp",
  "email": "owner@acme.com",
  "phone": "+1234567890",
  "address": "123 Main St",
  "website": "https://acme.com",
  "tempPassword": "SecurePass123",
  "status": true
}
```

- `companyName`, `email`, `phone` required. `address`, `website`, `tempPassword`, `status` optional.

**What to check (201 Created):**

- `data.id`, `data.companyName`, `data.email`, `data.owner` (name, email, phone, address)
- 401 if not Super Admin; 409 if email already in use

---

## 4. Update business

**Endpoint:** `PATCH /api/businesses/{id}`

**Request body (JSON, all optional):**

```json
{
  "companyName": "New Name",
  "email": "new@acme.com",
  "phone": "+9876543210",
  "address": "456 Oak St",
  "website": "https://newacme.com",
  "status": true
}
```

**What to check:** Response includes updated business fields; 404 if not found.

---

## 5. Get business clients

**Endpoint:** `GET /api/businesses/{id}/clients`

**Query (optional):** same as list businesses (search, status, page, limit).

**What to check:** `data` array of clients for that business; `pagination`.

---

## 6. Get business jobs (work orders)

**Endpoint:** `GET /api/businesses/{id}/jobs`

**Query (optional):** search, status, page, limit.

**What to check:** `data` array of work orders/jobs; `pagination`.

---

## 7. Toggle business status

**Endpoint:** `PATCH /api/businesses/{id}/status`

**Request body:**

```json
{ "status": false }
```

**What to check:** `data.id`, `data.status`; 404 if not found.

---

## 8. Suspend / Unsuspend

**Endpoint:** `POST /api/businesses/{id}/suspend` or `POST /api/businesses/{id}/unsuspend`

No body. **What to check:** `data.id`, `data.status`; 404 if not found.

---

## 9. Send email to business

**Endpoint:** `POST /api/businesses/{id}/send-email`

**Request body:**

```json
{
  "subject": "Important update",
  "body": "Email content here."
}
```

Either `body` or `message` is required. **What to check:** `success`, `message`, `email`; 404/403 on failure.

---

## 10. Send reminder

**Endpoint:** `POST /api/businesses/{id}/reminder`

No body. **What to check:** `success`, `message`, `email`; 404 if not found.

---

## Quick checklist

| Step | Endpoint | Check |
|------|----------|--------|
| 1 | `GET /api/businesses` | List returns `data` + `pagination` |
| 2 | `GET /api/businesses/{id}` | Detail matches expected business |
| 3 | `POST /api/businesses` (as Super Admin) | 201, `data.id` and `data.owner` |
| 4 | `PATCH /api/businesses/{id}` | Updated fields in response |
| 5 | `GET /api/businesses/{id}/clients` | Clients list for business |
| 6 | `GET /api/businesses/{id}/jobs` | Work orders for business |

---

## Related

- **Service:** `business.service.ts` – `getBusinesses`, `getBusinessById`, `createBusiness`, `updateBusiness`, clients/jobs helpers, status/suspend/unsuspend, sendEmail, sendReminder.
- **Errors:** `BusinessNotFoundError`, `EmailAlreadyUsedError` (handled in handler).
