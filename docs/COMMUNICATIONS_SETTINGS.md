# Communications Settings – Overview & API Reference

**Audience:** Engineers integrating or extending the **Communications** area of business settings (automated email reminders and template editing).

**Base URL:** `/api/settings` (same auth and permission model as [Settings API](./SETTINGS_API.md): session cookie; permissions `settings` **read** / **update** where noted.)

---

## 1. Product scope

The **Communications Settings** screen lets a business:

- Choose **default** WhatsApp behaviour for quote/invoice sends (stored client-side in localStorage in the current UI).
- Manage **message rows**: booking confirmations, quote sends, **automated reminders**, invoices, follow-ups, etc.
- For **automated reminders** that are wired to the backend, configure **master toggle**, **schedule rows** (email-only), **email subject/body** with `{token}` variables, preview, **Reset**, and **Insert Variable**.

Rows that use live APIs today:

| UI row (concept) | Backend feature | Primary docs |
|------------------|-----------------|--------------|
| Booking confirmation reminders | `BOOKING_CONFIRMATION` reminder configs + template | [BOOKING_CONFIRMATION_REMINDERS_API.md](./BOOKING_CONFIRMATION_REMINDERS_API.md), [BOOKING_CONFIRMATION_REMINDERS.docs](./BOOKING_CONFIRMATION_REMINDERS.docs) |
| Quote reminders | `QUOTE_REMINDER` reminder configs + `QUOTE_FOLLOW_UP` email template | This file (§3–4) |

Other rows in the list may still use **local-only** or **placeholder** modals until each is connected to an API.

---

## 2. Frontend (Kellu app)

| Area | Path / module |
|------|----------------|
| Page / section | `kellu-frontend/app/settings/...` (route that renders **Communications**; component below) |
| Main UI | `kellu-frontend/app/settings/_components/CommunicationsSettings.tsx` |
| Booking reminders API client | `kellu-frontend/lib/bookingConfirmationRemindersApi.ts` |
| Quote reminders API client | `kellu-frontend/lib/quoteRemindersApi.ts` |
| Template preview sample data | `kellu-frontend/lib/messageTemplatePreview.ts` |
| Strings | `kellu-frontend/dictionaries/en.json`, `es.json` (`settings.communications.*`) |

**Credential behaviour:** reminder GET/PATCH calls use `credentials: 'include'` so the session cookie reaches `/api/settings/*`.

---

## 3. Booking confirmation reminders (summary)

- **Toggle:** `BusinessSettings.bookingRemindersEnabled`
- **Configs:** `ReminderConfig` where `reminderType = BOOKING_CONFIRMATION`, `channel = EMAIL`
- **Template:** `MessageTemplate` with `templateType = BOOKING_CONFIRMATION_REMINDER`, `channel = EMAIL`
- **Dispatch:** evaluates **work orders** (scheduled, not cancelled); reminder time is **before** `scheduledAt` (hours or calendar days + optional time-of-day in business timezone)
- **Dedupe:** `ReminderLog` per `(workOrderId, note = configId:<ReminderConfig.id>)`

Full request/response shapes, `skippedReasons`, and manual dispatch: **[BOOKING_CONFIRMATION_REMINDERS_API.md](./BOOKING_CONFIRMATION_REMINDERS_API.md)**.

**Cron / startup:** `triggerBookingConfirmationRemindersForAllBusinesses()` in `src/index.ts` (~every 60s).

---

## 4. Quote reminders

### 4.1 Data model

| Piece | Source |
|-------|--------|
| Master toggle | `BusinessSettings.quoteRemindersEnabled` |
| Schedule rows | `ReminderConfig`: `reminderType = QUOTE_REMINDER`, `channel = EMAIL`, `timeValue`, `timeUnit` (`hours` \| `days`), optional `timeOfDay` for **days** |
| Email template | `MessageTemplate`: `templateType = QUOTE_FOLLOW_UP`, `channel = EMAIL` |
| Send audit | `ReminderLog`: `entityType = QUOTE`, `entityId = quote.id`, `note = configId:<id>`, `reminderType = QUOTE_REMINDER`, `channel = EMAIL` |

### 4.2 HTTP endpoints

All under **`/api/settings`**.

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/quote-reminders` | settings read | Toggle, schedules, template, `uiHint` |
| PATCH | `/quote-reminders` | settings update | Replace all `QUOTE_REMINDER` EMAIL configs and upsert template; toggle `quoteRemindersEnabled` |
| POST | `/quote-reminders/dispatch` | settings update | Run dispatch for **this** business (`asOf?`, `dryRun?`) |
| GET | `/quote-reminders/template-variables` | settings read | Insert-variable token list (same token set as booking reminder variables endpoint) |

**Service implementation:** `src/services/quote-reminders.service.ts`

### 4.3 Dispatch rules (automation)

The job loads **enabled** `ReminderConfig` rows (EMAIL, `QUOTE_REMINDER`) and **quotes** where:

- `quoteStatus = AWAITING_RESPONSE` (product copy: *awaiting approval / response* on a sent quote)
- `quoteSentAt` is not null
- `cancelled` is not used on `Quote`; status governs eligibility

For each **(quote × config)**:

1. **Client email** must exist; otherwise skip (`noClientEmail`).
2. **Due time** = `quoteSentAt` + offset: **hours** = wall-clock add; **days** = business `timeZone` calendar day + optional `timeOfDay` (or start of that day if no time).
3. If `asOf` (default *now*) is **before** due time → skip (`notDueYet`).
4. If a `ReminderLog` already exists for the same `entityId` and `note = configId:<id>` → skip (`alreadySentForSchedule`) — **at most one email per schedule row per quote**.
5. Otherwise send via `emailService` and create `ReminderLog`.

If `quoteRemindersEnabled` is false, dispatch returns early (`quoteRemindersDisabled`). If there are no enabled configs, `noReminderConfigs` is incremented for that run’s accounting (see service).

**Cron / startup:** `triggerQuoteRemindersForAllBusinesses()` in `src/index.ts` (~every 60s), alongside booking and client follow-up jobs.

### 4.4 GET response shape (informal)

`data` includes `enabled`, `schedules[]` (`id`, `timeValue`, `timeUnit`, `timeOfDay`, `channel: "EMAIL"`, `enabled`), `template: { subject, message }`, `uiHint`. If the business has **no** saved `ReminderConfig` rows yet, the service may return **default** example schedules in GET for display until the user saves (then rows are persisted).

### 4.5 PATCH body (informal)

- `enabled: boolean`
- `schedules: { timeValue, timeUnit, timeOfDay? (for days), enabled? }[]` — server replaces all `QUOTE_REMINDER` EMAIL configs
- `template: { subject, message }`

---

## 5. OpenAPI

Route definitions: `src/routes/settings/settings.routes.ts`  
Handlers: `src/routes/settings/settings.handler.ts`  

The Scalar / OpenAPI reference is served with the app (see `configureOpenAPI` and your usual dev port) under the documented **Settings** tag.

---

## 6. Related documentation

- [SETTINGS_API.md](./SETTINGS_API.md) – core profile/company settings
- [BOOKING_CONFIRMATION_REMINDERS_API.md](./BOOKING_CONFIRMATION_REMINDERS_API.md) – booking reminder API detail
- [FRONTEND_API_INTEGRATION.md](./FRONTEND_API_INTEGRATION.md) – general frontend patterns (if present in your branch)

---

## 7. Migrations / Prisma

Quote automation requires enum value **`QUOTE_REMINDER`** on `ReminderType` (see migrations under `prisma/migrations/`). After pulling, run `prisma migrate deploy` and `prisma generate` in your environment.
