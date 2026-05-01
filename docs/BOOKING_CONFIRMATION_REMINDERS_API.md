# Booking Confirmation Reminders API

Base URL: `http://localhost:8000`  
All endpoints require authentication.

This is the complete guide to configure and test the end-to-end booking confirmation email reminder flow.

---

## Scope

This flow is for **email reminders only**.

- workorder-based reminders from business settings
- reminder schedules (hours/days before appointment)
- reminder email template (subject/message)
- on-demand dispatch and automatic dispatch

Not in scope:

- WhatsApp reminders

---

## How data maps to UI fields

From the "Edit Booking confirmation Reminders" modal:

- `Reminder` toggle -> `BusinessSettings.bookingRemindersEnabled`
- `Schedules` rows -> `ReminderConfig` with:
  - `reminderType = BOOKING_CONFIRMATION`
  - `channel = EMAIL`
  - `timeValue`, `timeUnit`, `timeOfDay`, `isEnabled`
- `Email subject` + `Message` -> `MessageTemplate` with:
  - `templateType = BOOKING_CONFIRMATION_REMINDER`
  - `channel = EMAIL`
  - `subject`, `message`

---

## Endpoints

### GET `/api/settings/booking-confirmation-reminders`

Returns current reminder toggle, schedules, and email template.

### PATCH `/api/settings/booking-confirmation-reminders`

Creates/updates/deletes schedule rows and updates email template.

Request body (example):

```json
{
  "enabled": true,
  "schedules": [
    {
      "timeValue": 1,
      "timeUnit": "hours",
      "enabled": true
    },
    {
      "timeValue": 1,
      "timeUnit": "days",
      "timeOfDay": "02:30 PM",
      "enabled": true
    }
  ],
  "template": {
    "subject": "Scheduled reminder: Booking confirmation Reminders",
    "message": "Hi {client_name},\n\nReminder about your upcoming appointment. We look forward to seeing you.\n\nThanks,\n{business_name}"
  }
}
```

### POST `/api/settings/booking-confirmation-reminders/dispatch`

Dispatches due reminders for the authenticated business.

Request body:

```json
{
  "asOf": "2026-05-01T10:00:00.000Z",
  "dryRun": false
}
```

- `asOf` optional: dispatch evaluation time (default now)
- `dryRun` optional: if `true`, calculates but does not send/write logs

Success response shape:

```json
{
  "message": "Booking confirmation reminders dispatched successfully",
  "success": true,
  "data": {
    "asOf": "2026-05-01T10:00:00.000Z",
    "dryRun": false,
    "processed": 12,
    "sent": 3,
    "skipped": 9,
    "skippedReasons": {
      "bookingReminderDisabled": 0,
      "noReminderConfigs": 0,
      "noClientEmail": 1,
      "alreadySentForSchedule": 3,
      "notDueYet": 3,
      "missedWindow": 2
    }
  }
}
```

---

## Business rules implemented

1. **Workorder only**  
   Reminders are evaluated only from existing `WorkOrder` records.

2. **Email only**  
   Booking reminder settings are persisted with `channel = EMAIL`.

3. **Manual + scheduled both allowed**  
   Manual send from workorder does not block scheduled business reminder flow.

4. **No duplicate sends per schedule config**  
   One `ReminderConfig.id` is sent at most once per workorder.

5. **No late send**  
   If current dispatch time is after computed reminder time, reminder is skipped (`missedWindow`).

6. **Future reminders not sent**  
   If computed reminder time is in future, skipped (`notDueYet`).

7. **No client email -> skip**  
   Workorders with no client email are skipped (`noClientEmail`).

8. **Global business toggle**  
   If disabled, dispatch exits (`bookingReminderDisabled`).

---

## Reminder time calculation

For each enabled schedule:

- `hours`: `scheduledAt - timeValue hours`
- `days`: `scheduledAt - timeValue days`, then apply `timeOfDay` if provided

Rule:

- send only when reminder time is reached at dispatch evaluation
- if evaluation is already after reminder time, do not send late (skip)

Example:

- schedule: 6 hours before
- appointment starts in 4 hours
- result: skipped with `missedWindow`

---

## Complete QA checklist (end-to-end)

## 1) Preconditions

- backend server running
- authenticated user with `settings.update` permission
- at least one client with valid email
- at least one scheduled workorder linked to that client

## 2) Save reminder settings from modal/API

PATCH `/api/settings/booking-confirmation-reminders` with:

- `enabled: true`
- at least one schedule row
- email template subject + message

Expected:

- `200 OK`
- response `data.schedules` includes saved rows
- response template matches saved subject/message

## 3) Verify read-back

GET `/api/settings/booking-confirmation-reminders`

Expected:

- saved `enabled`
- saved schedules
- saved template values

## 4) Dry run check

POST `/api/settings/booking-confirmation-reminders/dispatch` with:

```json
{ "dryRun": true }
```

Expected:

- `200 OK`
- counters populated
- no email should be actually sent
- no new `ReminderLog` row should be created

## 5) Real dispatch check

POST `/api/settings/booking-confirmation-reminders/dispatch` with:

```json
{ "dryRun": false }
```

Expected:

- due reminders are sent by email
- `sent` increments
- `ReminderLog` entries created with:
  - `reminderType = BOOKING_CONFIRMATION`
  - `channel = EMAIL`
  - `entityType = WORK_ORDER`
  - `workOrderId`, `clientId`, `businessId`
  - `note = configId:<id>`

## 6) Duplicate prevention check

Call dispatch again immediately (`dryRun: false`).

Expected:

- previously sent schedule/workorder pairs are skipped
- `alreadySentForSchedule` increases

## 7) Missed window check (your required rule)

Create/choose workorder where reminder time is already in the past.

Example:

- schedule = 6 hours before
- appointment is only 4 hours from now

Dispatch now.

Expected:

- not sent
- `missedWindow` increases

## 8) Future window check

Use reminder config not yet due.

Expected:

- not sent
- `notDueYet` increases

## 9) Manual send coexistence check

- manually send booking confirmation/reminder from workorder flow
- run business dispatch

Expected:

- scheduled reminders are still evaluated/sent if due
- manual send does not suppress scheduled flow

## 10) Background scheduler check

Without calling dispatch endpoint manually, wait for periodic runner.

Expected:

- backend periodic task evaluates and sends due reminders automatically (every ~60 seconds)

---

## Quick curl examples

```bash
curl -X GET "http://localhost:8000/api/settings/booking-confirmation-reminders" \
  -H "Authorization: Bearer <TOKEN>"
```

```bash
curl -X PATCH "http://localhost:8000/api/settings/booking-confirmation-reminders" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "schedules": [
      { "timeValue": 1, "timeUnit": "hours", "enabled": true },
      { "timeValue": 1, "timeUnit": "days", "timeOfDay": "02:30 PM", "enabled": true }
    ],
    "template": {
      "subject": "Scheduled reminder: Booking confirmation Reminders",
      "message": "Hi {client_name},\n\nReminder about your upcoming appointment.\n\nThanks,\n{business_name}"
    }
  }'
```

```bash
curl -X POST "http://localhost:8000/api/settings/booking-confirmation-reminders/dispatch" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": true }'
```

```bash
curl -X POST "http://localhost:8000/api/settings/booking-confirmation-reminders/dispatch" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": false }'
```

---

## Common errors

- `401 Unauthorized`: not logged in
- `403 Forbidden`: missing settings permission
- `404 Not Found`: business not resolved for user
- `500 Internal Server Error`: unexpected failure while fetching/saving/sending

---

## Next recommended test order

1. PATCH settings (save schedules + template)
2. GET settings (verify persistence)
3. POST dispatch with `dryRun: true`
4. POST dispatch with `dryRun: false`
5. re-run dispatch (verify duplicate skip)
6. run missed-window scenario (verify skip)
7. verify background automatic dispatch

