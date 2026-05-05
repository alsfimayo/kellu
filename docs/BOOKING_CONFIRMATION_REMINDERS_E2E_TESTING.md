# Booking confirmation reminders — E2E testing (automation, communications, manual override)

This guide is for **manual QA** of the **Settings → Communications → Booking confirmation Reminders** automation, including how it interacts with **Send booking confirmation** and **customer reminders** (Clients / Workorders). It lists **every HTTP request and example response** you need.

**Base URL:** `http://localhost:<PORT>` (default port **8080** from `PORT` / `PORT_NO` in `.env`). All paths below assume the app mounts business APIs at `/api`.

**Auth:** Use the same session cookie or `Authorization` header as the web app after sign-in. Without auth you receive `401`.

---

## 1. Business rules (what the server enforces)

| Rule | Implementation |
| --- | --- |
| **Work order required** | Dispatch only loads `WorkOrder` rows: not cancelled, `scheduledAt` set, **`workOrderNumber` not null**. Quote-only clients never appear. |
| **After “Send booking confirmation”** | `WorkOrder.bookingConfirmationSentAt` is set (`POST /api/workorders/{workOrderId}/send-booking-confirmation`). **No automated** booking confirmation **reminder** email is sent for that work order afterward. Dispatch reports `skippedReasons.suppressedAfterBookingConfirmationEmail`. |
| **After manual customer reminder** | Creating a customer reminder from **Clients** or **Workorders** stamps `WorkOrder.confirmationReminderSentAt` (see §2.3). Automated reminders are **skipped** for affected jobs (`skippedReasons.suppressedByManualCustomerReminder`). |
| **Dedupe per schedule** | At most one automated send per `(workOrderId, ReminderConfig row)` via `ReminderLog` + `note = configId:<id>` (`alreadySentForSchedule`). |

---

## 2. Endpoint reference (requests and responses)

Standard success shape for most endpoints:

```json
{ "message": "…", "success": true, "data": { } }
```

Errors: `{ "message": "…" }` with status `400`, `401`, `403`, `404`, or `500`.

### 2.1 GET booking reminder settings

**Request**

```http
GET /api/settings/booking-confirmation-reminders HTTP/1.1
Host: localhost:8080
Cookie: <session>
```

**Response `200`**

```json
{
  "message": "Booking confirmation reminders retrieved successfully",
  "success": true,
  "data": {
    "enabled": true,
    "schedules": [
      {
        "id": "clxxxxxxxxxxxxxxxxxxxx01",
        "timeValue": 1,
        "timeUnit": "hours",
        "timeOfDay": null,
        "channel": "EMAIL",
        "enabled": true
      }
    ],
    "template": {
      "subject": "Scheduled reminder: Booking confirmation Reminders",
      "message": "Hi {client_name},\n\nReminder about your upcoming appointment.\n\nThanks,"
    },
    "uiHint": "If current time is after the set reminder time, no reminder is sent (e.g. a 6 hours before reminder set for an appointment scheduled 4 hours before would not be sent)."
  }
}
```

**Permissions:** `settings` **read**.

---

### 2.2 PATCH booking reminder settings

**Request**

```http
PATCH /api/settings/booking-confirmation-reminders HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Cookie: <session>
```

**Body (required)**

| Field | Type | Notes |
| --- | --- | --- |
| `enabled` | boolean | Master toggle. |
| `schedules` | array | May be `[]`. Each item needs `timeValue` (1–720), `timeUnit` (`hours` \| `days`), optional `timeOfDay` for `days`, optional `enabled` (default true). |
| `template` | object | `subject` (min 1 char), `message` (min 1 char). Tokens: `{client_name}`, etc. |

```json
{
  "enabled": true,
  "schedules": [{ "timeValue": 1, "timeUnit": "hours", "enabled": true }],
  "template": {
    "subject": "Scheduled reminder: Booking confirmation Reminders",
    "message": "Hi {client_name},\n\nReminder about your upcoming appointment.\n\nThanks,\n{business_name}"
  }
}
```

**Response `200`**

Same shape as GET `data`: `enabled`, `schedules` (new `id`s after save), `template`, `uiHint`.

**Permissions:** `settings` **update**.

---

### 2.3 GET template variables (Insert variable dropdown)

**Request**

```http
GET /api/settings/booking-confirmation-reminders/template-variables HTTP/1.1
Host: localhost:8080
Cookie: <session>
```

**Response `200`**

```json
{
  "message": "Booking reminder template variables retrieved successfully",
  "success": true,
  "data": {
    "variables": [
      { "key": "client_name", "label": "Client name", "example": "Natasha" },
      { "key": "job_date_time", "label": "Job date & time", "example": "May 5, 2026 9:00 AM" }
    ],
    "insertFormat": "Use curly braces in templates, e.g. {client_name}",
    "note": "Same token set as GET /api/clients/{clientId}/message-template response data.variables (preview values are per-client; here keys are for editor insert)."
  }
```

The live `variables` array is longer than this snippet; treat a real response as authoritative.

**Permissions:** `settings` **read**.

---

### 2.4 POST dispatch (evaluate and send)

**Request**

```http
POST /api/settings/booking-confirmation-reminders/dispatch HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Cookie: <session>
```

**Body**

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `asOf` | ISO 8601 string | omit → server “now” | Virtual clock for due / missed-window tests. |
| `dryRun` | boolean | `false` | If `true`: no Resend send, **no** `ReminderLog` insert; `sent` = “would send” count. |

```json
{}
```

Dry run:

```json
{ "dryRun": true }
```

Time-travel (example):

```json
{
  "asOf": "2026-05-10T17:30:00.000Z",
  "dryRun": false
}
```

**Response `200`**

```json
{
  "message": "Booking confirmation reminders dispatched successfully",
  "success": true,
  "data": {
    "asOf": "2026-05-10T17:30:01.234Z",
    "dryRun": false,
    "processed": 8,
    "sent": 1,
    "skipped": 7,
    "skippedReasons": {
      "bookingReminderDisabled": 0,
      "noReminderConfigs": 0,
      "noWorkOrderNumber": 0,
      "noClientEmail": 0,
      "suppressedAfterBookingConfirmationEmail": 2,
      "suppressedByManualCustomerReminder": 0,
      "alreadySentForSchedule": 3,
      "notDueYet": 1,
      "missedWindow": 1,
      "noScheduledAppointment": 0,
      "cancelledWorkOrder": 0
    }
  }
}
```

| `skippedReasons` key | Meaning |
| --- | --- |
| `bookingReminderDisabled` | `BusinessSettings.bookingRemindersEnabled` is false. |
| `noReminderConfigs` | No enabled EMAIL `BOOKING_CONFIRMATION` schedule rows. |
| `noWorkOrderNumber` | Work order lacks a `workOrderNumber` (legacy / bad data); excluded from eligibility. |
| `noClientEmail` | Client on the job has no email. |
| `suppressedAfterBookingConfirmationEmail` | `bookingConfirmationSentAt` is set (booking confirmation email was sent). |
| `suppressedByManualCustomerReminder` | `confirmationReminderSentAt` set (manual customer reminder from Clients or Workorders). |
| `alreadySentForSchedule` | Automated log exists for this config + work order (`configId:` note). |
| `notDueYet` | Before computed reminder instant. |
| `missedWindow` | Too soon vs `createdAt`, or current time ≥ `scheduledAt`. |
| `noScheduledAppointment` | Defensive; normally filtered earlier. |
| `cancelledWorkOrder` | Reserved; cancelled rows are excluded up front. |

**Note:** `data.skipped` equals the **sum** of all `skippedReasons` values (not `processed − sent`).

**Permissions:** `settings` **update**.

**Background behaviour:** Even without POST, `src/index.ts` runs the same dispatch for **all businesses** about every **60 seconds**.

---

### 2.5 POST Send booking confirmation (Communications — suppresses automation)

Marks the customer as having received the booking confirmation email and sets **`bookingConfirmationSentAt`** on the work order.

**Request**

```http
POST /api/workorders/{workOrderId}/send-booking-confirmation HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Cookie: <session>

{}
```

Optional body (custom subject):

```json
{ "subject": "Booking Confirmation - Plumbing - May 5, 2026" }
```

**Response `200`**

```json
{
  "message": "Booking confirmation sent successfully",
  "success": true,
  "data": {
    "...": "Full work order payload as returned elsewhere; includes bookingConfirmationSentAt ISO string after send"
  }
}
```

Typical failures: `404` work order / business, `400` missing client email, `403` missing `workorders` **update**.

**Permissions:** `workorders` **update**.

---

### 2.6 POST Customer reminder — work order scoped

Sets a follow-up reminder tied to the work order, emails if the client has an address, and sets **`confirmationReminderSentAt`** on **this** work order (suppresses automation for this job).

**Request**

```http
POST /api/workorders/{workOrderId}/customer-reminders HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Cookie: <session>

{
  "date": "2026-05-07",
  "time": "09:30 AM",
  "note": "Call before arriving"
}
```

| Field | Type | Required |
| --- | --- | --- |
| `date` | date (JSON string) | yes |
| `time` | string | yes (`9:30 AM`, `14:30`, etc.) |
| `note` | string \| null | no |

**Response `201`**

```json
{
  "message": "Customer reminder saved successfully",
  "success": true,
  "data": {
    "upcomingReminder": {
      "dateTime": "2026-05-07T09:30:00.000Z",
      "note": "Call before arriving"
    },
    "reminders": [
      {
        "id": "clyyyyyyyyyyyyyyyyyy01",
        "dateTime": "2026-05-07T09:30:00.000Z",
        "note": null,
        "channel": "EMAIL",
        "createdAt": "2026-05-06T11:22:33.444Z"
      }
    ]
  }
}
```

**Permissions:** `workorders` **update**.

---

### 2.7 POST Customer reminder — client scoped (“Clients” module)

Creates a reminder on the client. **Additionally** stamps **`confirmationReminderSentAt`** on non-cancelled work orders for that client with **`scheduledAt` in the future** (same wall-clock instant as request processing).

**Request**

```http
POST /api/clients/{clientId}/customer-reminders HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Cookie: <session>

{
  "date": "2026-05-08",
  "time": "03:45 PM",
  "note": "Follow up invoice"
}
```

**Response `201`**

```json
{
  "message": "Customer reminder saved successfully",
  "success": true,
  "data": {
    "upcomingReminder": {
      "dateTime": "2026-05-08T15:45:00.000Z",
      "note": "Follow up invoice"
    },
    "scheduledReminders": [
      {
        "id": "clzzzzzzzzzzzzzzzzzz01",
        "dateTime": "2026-05-08T15:45:00.000Z",
        "note": "Follow up invoice",
        "createdAt": "2026-05-07T09:01:02.033Z"
      }
    ],
    "triggeredReminders": []
  }
}
```

**Permissions:** `clients` **update**.

---

## 3. Suggested QA scenarios

### Scenario A — Happy path automation

1. PATCH settings: `enabled: true`, one schedule `1 hour` before, template with `{client_name}`.
2. Create client with email + work order: `scheduledAt` in future, **more than one hour after** `createdAt`, **`workOrderNumber` present** (default on create).
3. POST dispatch with `dryRun: true` while before reminder window → expect `sent: 0`, `notDueYet` incrementing as appropriate.
4. POST dispatch with `{}` **or** `"asOf"` inside the reminder window (**after** reminder instant, **before** `scheduledAt`), `dryRun: false` → expect `sent >= 1` and inbox delivery (if Resend configured).
5. Repeat dispatch immediately → **`sent: 0`**, **`alreadySentForSchedule`** increased.

### Scenario B — Send booking confirmation blocks automation

1. Same WO as Scenario A eligibility.
2. `POST …/send-booking-confirmation` with `{}`.
3. POST dispatch in the same reminder window → expect **`suppressedAfterBookingConfirmationEmail`** for that WO (all configs), **`sent: 0`** for it.

### Scenario C — Manual customer reminder blocks automation

1. Eligible WO **without** `bookingConfirmationSentAt`.
2. `POST …/customer-reminders` on **Clients** **or** `POST …/customer-reminders` on **Workorders** (§2.6–2.7).
3. POST dispatch in reminder window → expect **`suppressedByManualCustomerReminder`** for stamped work orders.

### Scenario D — Quote-only client

1. Client with quote but **no** work order → never appears in dispatch query → **no** automated booking reminder emails.

---

## 4. Related docs

| Document | Contents |
| --- | --- |
| `docs/BOOKING_CONFIRMATION_REMINDERS.docs` | Prisma enums, cron, persistence |
| `docs/BOOKING_CONFIRMATION_REMINDERS_API.md` | Deep dispatch timing maths, curl recipes |
| `http://localhost:<PORT>/reference` | Generated OpenAPI (Settings, Workorders, Clients) |

---

## 5. `curl` quick copy

Replace `SESSION` with your cookie header value.

```bash
curl -s "http://localhost:8080/api/settings/booking-confirmation-reminders" \
  -H "Cookie: SESSION"

curl -s -X PATCH "http://localhost:8080/api/settings/booking-confirmation-reminders" \
  -H "Content-Type: application/json" \
  -H "Cookie: SESSION" \
  -d '{"enabled":true,"schedules":[{"timeValue":1,"timeUnit":"hours","enabled":true}],"template":{"subject":"Test","message":"Hi {client_name}"}}'

curl -s -X POST "http://localhost:8080/api/settings/booking-confirmation-reminders/dispatch" \
  -H "Content-Type: application/json" \
  -H "Cookie: SESSION" \
  -d "{\"dryRun\":true}"
```

```bash
curl -s -X POST "http://localhost:8080/api/workorders/WORK_ORDER_ID/send-booking-confirmation" \
  -H "Content-Type: application/json" \
  -H "Cookie: SESSION" \
  -d "{}"
```
