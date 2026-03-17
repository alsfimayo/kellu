# Price List API – Documentation & Testing

**Route folder:** `src/routes/pricelistitems`  
**Base path:** `/api/price-list`  
**Service:** `src/services/price-list.service.ts`

All endpoints require **authentication**.  
Base URL: `http://localhost:8000` (or your server).

---

## Module files

| File | Purpose |
|------|--------|
| `price-list.routes.ts` | OpenAPI routes and schemas: PriceListQuerySchema, CreatePriceListItemBodySchema, UpdatePriceListItemBodySchema, ImportPriceListBodySchema |
| `price-list.handler.ts` | Handlers: getBusinessIdByUserId, hasPermission (as configured), call price-list.service |
| `index.ts` | Registers price list routes with the router |

---

## Endpoints

| Method | Path | Summary |
|--------|------|---------|
| GET | `/` | List price list items (search, itemType, sortBy, order, page, limit) |
| GET | `/{id}` | Get price list item by ID |
| POST | `/` | Create (add) item |
| PATCH | `/{id}` | Update item |
| DELETE | `/{id}` | Delete item |
| POST | `/import` | Bulk import items (array of create payloads) |

**Item types:** `SERVICE`, `PRODUCT`

---

## 1. List price list items

**Endpoint:** `GET /api/price-list`

**Query (optional):** `search`, `itemType` (SERVICE | PRODUCT), `sortBy` (name | createdAt | itemType), `order` (asc | desc), `page`, `limit`

**Example:** `GET http://localhost:8000/api/price-list?itemType=SERVICE&page=1&limit=20`

**What to check:**

- `data` array: each item has `id`, `itemType`, `name`, `description`, `cost`, `markupPercent`, `price`, `createdAt`, `updatedAt`
- `pagination`: `page`, `limit`, `total`, `totalPages`
- 403 if no permission; 404 if business not found

---

## 2. Get price list item by ID

**Endpoint:** `GET /api/price-list/{id}`

**What to check:**

- `data.id`, `data.itemType`, `data.name`, `data.description`, `data.cost`, `data.markupPercent`, `data.price`
- 404 if item not found; 403 if no permission

---

## 3. Create (add) item

**Endpoint:** `POST /api/price-list`

**Purpose:** Add a service or product to the master price list (Add item form).

**Request body (JSON):**

```json
{
  "itemType": "SERVICE",
  "name": "Plumbing repair",
  "description": "Standard plumbing repair per hour",
  "cost": 50,
  "markupPercent": 20,
  "price": 60
}
```

- **Required:** `name`, `price` (number ≥ 0)
- **Optional:** `itemType` (default SERVICE), `description`, `cost`, `markupPercent`

**What to check (201 Created):**

- `data.id`, `data.itemType`, `data.name`, `data.price`, `data.cost`, `data.markupPercent`, `data.createdAt`, `data.updatedAt`
- 400 on validation error; 404 if business not found; 403 if no permission

**Save:** `data.id` for use as `priceListItemId` in work order or quote line items.

---

## 4. Update item

**Endpoint:** `PATCH /api/price-list/{id}`

**Request body (JSON, all fields optional):**

```json
{
  "itemType": "PRODUCT",
  "name": "Updated name",
  "description": "New description",
  "cost": 55,
  "markupPercent": 25,
  "price": 70
}
```

**What to check (200 OK):** Updated item in response; 404 if item not found; 403 if no permission.

---

## 5. Delete item

**Endpoint:** `DELETE /api/price-list/{id}`

No body. **What to check:** Response includes `deleted: true` or success message; 404 if item not found; 403 if no permission.

---

## 6. Bulk import

**Endpoint:** `POST /api/price-list/import`

**Purpose:** Import multiple items at once (e.g. from CSV parsed on client). Same shape as create; array of 1–500 items.

**Request body (JSON):**

```json
{
  "items": [
    {
      "itemType": "SERVICE",
      "name": "Service A",
      "description": null,
      "cost": 10,
      "markupPercent": 15,
      "price": 11.5
    },
    {
      "itemType": "PRODUCT",
      "name": "Product B",
      "description": "Part B",
      "cost": 20,
      "markupPercent": 10,
      "price": 22
    }
  ]
}
```

**What to check (201 Created):**

- `data.created`: number of items created
- `data.data`: array of created items (with ids)
- 400 if validation fails or array empty/>500; 404 if business not found; 403 if no permission

---

## Quick checklist

| Step | Endpoint | Check |
|------|----------|--------|
| 1 | `GET /api/price-list` | List returns `data` + `pagination` |
| 2 | `POST /api/price-list` | 201, `data.id`, `data.name`, `data.price` |
| 3 | `GET /api/price-list/{id}` | Item detail matches create |
| 4 | `PATCH /api/price-list/{id}` | Updated fields in response |
| 5 | `POST /api/price-list/import` | `created` count and `data` array |
| 6 | `DELETE /api/price-list/{id}` | Success / deleted |

---

## Related

- **Service:** `price-list.service.ts` – listPriceListItems, getPriceListItemById, createPriceListItem, updatePriceListItem, deletePriceListItem, importPriceListItems.
- **Errors:** `PriceListItemNotFoundError` → 404, `BusinessNotFoundError` → 404 (in handler).
- **Usage:** Use price list item `id` as `priceListItemId` in work order or quote line items when adding from catalog.
