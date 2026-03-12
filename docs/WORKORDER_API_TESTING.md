# Work Order API – Testing price, subtotal, total, payments

Base URL: `http://localhost:8000` (or your server).  
All work order endpoints require **authentication** (session cookie or auth header as your app uses).

---

## 1. Create a work order (with line items)

**Endpoint:** `POST /api/workorders`

**Purpose:** Creates a work order and its line items, then **recalculates** subtotal, discount, total, cost and writes them to the work order.

**Request body (JSON):**

```json
{
  "title": "wood maker job",
  "clientId": "<your-client-id>",
  "address": "123 Main St",
  "isScheduleLater": false,
  "scheduledAt": null,
  "startTime": null,
  "endTime": null,
  "assignedToId": null,
  "instructions": null,
  "notes": null,
  "quoteRequired": false,
  "quoteTermsConditions": null,
  "invoiceTermsConditions": null,
  "discount": 10,
  "discountType": "PERCENTAGE",
  "taxPercent": null,
  "lineItems": [
    {
      "name": "wood maker",
      "itemType": "SERVICE",
      "description": null,
      "quantity": 2,
      "price": 2000,
      "cost": 2500,
      "priceListItemId": null
    }
  ]
}
```

**Expected calculation:**

- Subtotal = 2 × 2000 = **4000**
- Discount (10%) = 4000 × 0.10 = **400**
- After discount = 4000 − 400 = **3600**
- Tax (if taxPercent 0) = 0 → **Total = 3600**
- Cost = 2 × 2500 = **5000**
- amountPaid = 0, balance = 3600

**What to check in the response (201 Created):**

- `data.subtotal` = `"4000"` (or 4000)
- `data.total` = `"3600"`
- `data.cost` = `"5000"`
- `data.amountPaid` = `"0"`
- `data.balance` = `"3600"`
- `data.lineItems` has one item with quantity 2, price 2000

**Save for next steps:** `data.id` (work order id) and optionally `data.clientId` (to create more work orders).

---

## 2. Get work order by ID (verify subtotal / total)

**Endpoint:** `GET /api/workorders/{workOrderId}`

**Purpose:** Confirms that after create, the work order has correct subtotal, total, cost, balance in the DB.

**Example:** `GET http://localhost:8000/api/workorders/cmmn30ula000lv1nob3blkfam`

**What to check:**

- `data.subtotal`, `data.total`, `data.cost`, `data.amountPaid`, `data.balance` match the expected values from step 1.

---

## 3. Register a payment

**Endpoint:** `POST /api/workorders/{workOrderId}/payments`

**Purpose:** Records a payment, recalculates amountPaid and balance, and sets invoice status to PAID when balance ≤ 0.

**Request body (JSON):**

```json
{
  "amount": 3600,
  "paymentDate": "2026-03-12",
  "paymentMethod": "CASH",
  "referenceNumber": null,
  "note": null
}
```

- Use the same (or higher) amount as the work order **total** to fully pay it (e.g. 3600 from step 1).
- `paymentDate` can be omitted or null; server defaults to today.

**What to check in the response (201 Created):**

- `data.amountPaid` = `"3600"` (or 3600)
- `data.balance` = `"0"`
- `data.invoiceStatus` = `"PAID"`
- `data.subtotal`, `data.total` still correct (e.g. 4000, 3600)

---

## 4. Get work order again (verify after payment)

**Endpoint:** `GET /api/workorders/{workOrderId}`

**Purpose:** Confirms that after registering payment, amountPaid and balance are updated and persisted.

**What to check:**

- `data.amountPaid` = 3600 (or your payment amount)
- `data.balance` = 0
- `data.invoiceStatus` = `"PAID"`
- `data.subtotal`, `data.total` unchanged.

---

## 5. Optional – Add more line items to existing work order

**Endpoint:** `POST /api/workorders/{workOrderId}/line-items`

**Request body (JSON):**

```json
{
  "items": [
    {
      "priceListItemId": "<price-list-item-id>",
      "quantity": 1
    }
  ]
}
```

Or custom item (no price list):

```json
{
  "items": [
    {
      "name": "Extra service",
      "quantity": 1,
      "price": 500,
      "itemType": "SERVICE"
    }
  ]
}
```

After this, subtotal/total are recalculated; use **GET work order by ID** to verify.

---

## Quick checklist

| Step | Endpoint | Check |
|------|----------|--------|
| 1 | `POST /api/workorders` | `subtotal`, `total`, `cost`, `balance` non-zero and correct |
| 2 | `GET /api/workorders/{id}` | Same values as in step 1 response |
| 3 | `POST /api/workorders/{id}/payments` | `amountPaid`, `balance`, `invoiceStatus` updated |
| 4 | `GET /api/workorders/{id}` | `amountPaid`, `balance`, `invoiceStatus` still correct |

---

## Getting clientId and price list item id

- **Client list:** `GET /api/clients` → use one of the returned `id` values as `clientId`.
- **Price list (for line items from catalog):** `GET /api/workorders/price-list-items` → use an item `id` as `priceListItemId` in `POST .../line-items`.
