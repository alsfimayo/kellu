/**
 * Booking confirmation email reminders (business settings schedules + template).
 * WhatsApp is out of scope; persisted rows use channel EMAIL only.
 */

import { type Prisma, ReminderType, TemplateType } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'

const REMINDER_TYPE = ReminderType.BOOKING_CONFIRMATION
const TEMPLATE_TYPE = TemplateType.BOOKING_CONFIRMATION_REMINDER

const DEFAULT_SUBJECT = 'Scheduled reminder: Booking confirmation Reminders'
const DEFAULT_MESSAGE = `Hi {client_name},

Reminder about your upcoming appointment. We look forward to seeing you.

Thanks,`

/** Shown in API for parity with the in-app schedules UI. */
export const BOOKING_REMINDER_UI_HINT =
  'If current time is after the set reminder time, no reminder is sent (e.g. a 6 hours before reminder set for an appointment scheduled 4 hours before would not be sent).'

export interface BookingReminderScheduleInput {
  id?: string
  timeValue: number
  timeUnit: 'hours' | 'days'
  /** Required when timeUnit is days (e.g. "02:30 PM"); ignored for hours. */
  timeOfDay?: string | null
  enabled?: boolean
}

export interface BookingReminderTemplateInput {
  subject: string
  message: string
}

export interface BookingReminderScheduleRow {
  id: string
  timeValue: number
  timeUnit: 'hours' | 'days'
  timeOfDay: string | null
  channel: 'EMAIL'
  enabled: boolean
}

export interface BookingReminderSettingsPayload {
  enabled: boolean
  schedules: BookingReminderScheduleRow[]
  template: { subject: string; message: string }
  uiHint: string
}

export interface BookingReminderDispatchSkippedReasons {
  bookingReminderDisabled: number
  noReminderConfigs: number
  dispatchAlreadyRunning: number
  noWorkOrderNumber: number
  noClientEmail: number
  suppressedAfterBookingConfirmationEmail: number
  suppressedByManualCustomerReminder: number
  alreadySentForSchedule: number
  notDueYet: number
  missedWindow: number
  noScheduledAppointment: number
  cancelledWorkOrder: number
}

export interface BookingReminderDispatchResult {
  asOf: string
  dryRun: boolean
  processed: number
  sent: number
  skipped: number
  skippedReasons: BookingReminderDispatchSkippedReasons
}

export interface TemplateVariableDefinition {
  /** Placeholder token without braces, e.g. client_name -> {client_name} */
  key: string
  label: string
  example: string
}

function plainTextToHtml(text: string): string {
  return text
    .split('\n')
    .map(line => (line.length > 0 ? `<p>${line}</p>` : '<br/>'))
    .join('')
}

function formatMoneyForTemplate(value: Prisma.Decimal | number | null | undefined): string {
  if (value == null) {
    return '$0.00'
  }
  const raw = typeof value === 'number' ? value : Number(value)
  const amount = Number.isFinite(raw) ? raw : 0
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDateForTemplate(value: Date | null | undefined): string {
  if (!value) {
    return ''
  }
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTimeForTemplate(
  dateValue: Date | null | undefined,
  startTime?: string | null
): string {
  if (!dateValue && !startTime) {
    return ''
  }
  const datePart = dateValue ? formatDateForTemplate(dateValue) : ''
  if (!startTime) {
    return datePart
  }
  return datePart ? `${datePart} ${startTime}` : startTime
}

function joinLineItemsForTemplate(
  items: Array<{ name: string; quantity?: number | null }> | null | undefined
): string {
  if (!items?.length) {
    return ''
  }
  return items
    .map(item => {
      const qty = typeof item.quantity === 'number' && item.quantity > 1 ? ` x${item.quantity}` : ''
      return `${item.name}${qty}`
    })
    .join(', ')
}

/** Same keys as GET /clients/:id/message-template `data.variables` for Insert Variable dropdown. */
export function getBookingReminderTemplateVariableDefinitions(): TemplateVariableDefinition[] {
  return [
    { key: 'current_date', label: 'Current date', example: 'May 4, 2026' },
    { key: 'client_name', label: 'Client name', example: 'Natasha' },
    { key: 'company_info', label: 'Company info', example: 'Acme Plumbing' },
    { key: 'company_name', label: 'Company name', example: 'Acme Plumbing' },
    { key: 'business_name', label: 'Business name', example: 'Acme Plumbing' },
    { key: 'contact_email', label: 'Contact email', example: 'hello@acme.com' },
    { key: 'phone_number', label: 'Phone number', example: '(555) 123-4567' },
    { key: 'line_items', label: 'Line items', example: 'Drain clean x1' },
    { key: 'discount_amount', label: 'Discount amount', example: '$0.00' },
    { key: 'total', label: 'Total', example: '$120.00' },
    { key: 'payment_amount', label: 'Payment amount', example: '$0.00' },
    { key: 'balance', label: 'Balance', example: '$120.00' },
    { key: 'quote_number', label: 'Quote number', example: 'Q-1001' },
    { key: 'quote_sent_date', label: 'Quote sent date', example: 'May 1, 2026' },
    { key: 'workorder_number', label: 'Work order number', example: 'WO-2002' },
    { key: 'arrival_window', label: 'Arrival window', example: '8:00 AM - 10:00 AM' },
    { key: 'job_date', label: 'Job date', example: 'May 5, 2026' },
    { key: 'job_date_time', label: 'Job date & time', example: 'May 5, 2026 9:00 AM' },
    { key: 'job_address', label: 'Job address', example: '123 Main St' },
    { key: 'job_title', label: 'Job title', example: 'Assessment' },
    { key: 'invoice_number', label: 'Invoice number', example: 'INV-3003' },
    { key: 'invoice_sent_date', label: 'Invoice sent date', example: 'May 2, 2026' },
    { key: 'due_date', label: 'Due date', example: 'May 10, 2026' },
  ]
}

export function getBookingReminderTemplateVariablesResponse(): {
  variables: TemplateVariableDefinition[]
  insertFormat: string
  note: string
} {
  return {
    variables: getBookingReminderTemplateVariableDefinitions(),
    insertFormat: 'Use curly braces in templates, e.g. {client_name}',
    note: 'Same token set as GET /api/clients/{clientId}/message-template response data.variables (preview values are per-client; here keys are for editor insert).',
  }
}

function parseTimeOfDay(input: string | null | undefined): { hour: number; minute: number } | null {
  if (!input?.trim()) {
    return null
  }
  const s = input.trim()
  const ampm = /\b(am|pm)\b/i.exec(s)
  const num = s.match(/(\d{1,2}):(\d{2})/)
  if (!num) {
    return null
  }
  let hour = Number(num[1])
  const minute = Number(num[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null
  }
  if (ampm) {
    const isPm = ampm[1].toLowerCase() === 'pm'
    if (hour === 12) {
      hour = isPm ? 12 : 0
    } else if (isPm) {
      hour += 12
    }
  }
  if (hour < 0 || hour > 23) {
    return null
  }
  return { hour, minute }
}

function computeReminderTime(
  scheduledAt: Date,
  timeValue: number,
  timeUnit: 'hours' | 'days',
  timeOfDay: string | null | undefined,
  businessTimeZone: string
): Date {
  if (timeUnit === 'hours') {
    return new Date(scheduledAt.getTime() - timeValue * 60 * 60 * 1000)
  }

  const parsed = timeOfDay ? parseTimeOfDay(timeOfDay) : null
  // Bun / modern runtimes expose Temporal for IANA `timeZone` wall-clock math.
  const TemporalApi = (globalThis as { Temporal?: Record<string, unknown> }).Temporal as
    | undefined
    | {
        Instant: {
          fromEpochMilliseconds: (ms: number) => {
            toZonedDateTimeISO: (tz: string) => {
              toPlainDate: () => { subtract: (x: { days: number }) => PlainDateLike }
            }
          }
        }
        PlainTime: { from: (x: { hour: number; minute: number }) => unknown }
      }

  type PlainDateLike = {
    toZonedDateTime: (x: { timeZone: string; plainTime: unknown }) => { epochMilliseconds: number }
  }

  if (TemporalApi?.Instant && TemporalApi.PlainTime) {
    const tz = businessTimeZone?.trim() || 'UTC'
    try {
      const apptZ = TemporalApi.Instant.fromEpochMilliseconds(
        scheduledAt.getTime()
      ).toZonedDateTimeISO(tz)
      const reminderDay = apptZ.toPlainDate().subtract({ days: timeValue }) as PlainDateLike
      if (parsed) {
        const plainTime = TemporalApi.PlainTime.from({ hour: parsed.hour, minute: parsed.minute })
        const zdt = reminderDay.toZonedDateTime({ timeZone: tz, plainTime })
        return new Date(zdt.epochMilliseconds)
      }
      const midnight = TemporalApi.PlainTime.from({ hour: 0, minute: 0 })
      const zdt = reminderDay.toZonedDateTime({ timeZone: tz, plainTime: midnight })
      return new Date(zdt.epochMilliseconds)
    } catch {
      // fall through to naive UTC
    }
  }

  const base = new Date(scheduledAt.getTime() - timeValue * 24 * 60 * 60 * 1000)
  if (parsed) {
    base.setUTCHours(parsed.hour, parsed.minute, 0, 0)
  }
  return base
}

type TemplateVarPayload = Record<string, string>

async function buildTemplateVarsForWorkOrder(workOrderId: string): Promise<TemplateVarPayload> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      title: true,
      address: true,
      scheduledAt: true,
      startTime: true,
      endTime: true,
      workOrderNumber: true,
      discount: true,
      total: true,
      amountPaid: true,
      balance: true,
      lineItems: { select: { name: true, quantity: true } },
      client: {
        select: {
          name: true,
          business: {
            select: {
              name: true,
              email: true,
              phone: true,
              settings: { select: { replyToEmail: true } },
            },
          },
        },
      },
      quotes: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          quoteNumber: true,
          quoteSentAt: true,
          discount: true,
          total: true,
          amountPaid: true,
          balance: true,
          lineItems: { select: { name: true, quantity: true } },
        },
      },
      invoices: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          invoiceNumber: true,
          sentAt: true,
          dueAt: true,
          discount: true,
          total: true,
          amountPaid: true,
          balance: true,
          lineItems: { select: { name: true, quantity: true } },
        },
      },
    },
  })
  if (!wo?.client) {
    return {}
  }
  const client = wo.client
  const latestQuote = wo.quotes[0] ?? null
  const latestInvoice = wo.invoices[0] ?? null
  const lineItems =
    joinLineItemsForTemplate(wo.lineItems) ||
    joinLineItemsForTemplate(latestQuote?.lineItems) ||
    joinLineItemsForTemplate(latestInvoice?.lineItems) ||
    ''

  const preferredEmail = client.business.settings?.replyToEmail?.trim() || client.business.email
  const arrivalWindow =
    wo.startTime && wo.endTime ? `${wo.startTime} - ${wo.endTime}` : (wo.startTime ?? '')

  const currentDate = formatDateForTemplate(new Date())

  return {
    current_date: currentDate,
    client_name: client.name,
    company_info: client.business.name,
    company_name: client.business.name,
    business_name: client.business.name,
    contact_email: preferredEmail,
    phone_number: client.business.phone?.trim() || '',
    line_items: lineItems,
    discount_amount: formatMoneyForTemplate(
      wo.discount ?? latestQuote?.discount ?? latestInvoice?.discount ?? 0
    ),
    total: formatMoneyForTemplate(wo.total ?? latestQuote?.total ?? latestInvoice?.total ?? 0),
    payment_amount: formatMoneyForTemplate(
      wo.amountPaid ?? latestQuote?.amountPaid ?? latestInvoice?.amountPaid ?? 0
    ),
    balance: formatMoneyForTemplate(
      wo.balance ?? latestQuote?.balance ?? latestInvoice?.balance ?? 0
    ),
    quote_number: latestQuote?.quoteNumber ?? '',
    quote_sent_date: formatDateForTemplate(latestQuote?.quoteSentAt),
    workorder_number: wo.workOrderNumber ?? '',
    arrival_window: arrivalWindow,
    job_date: formatDateForTemplate(wo.scheduledAt),
    job_date_time: formatDateTimeForTemplate(wo.scheduledAt, wo.startTime),
    job_address: wo.address ?? '',
    job_title: wo.title ?? '',
    invoice_number: latestInvoice?.invoiceNumber ?? '',
    invoice_sent_date: formatDateForTemplate(latestInvoice?.sentAt),
    due_date: formatDateForTemplate(latestInvoice?.dueAt),
  }
}

function applyTemplateTokens(text: string, vars: TemplateVarPayload): string {
  let out = text
  for (const [token, value] of Object.entries(vars)) {
    out = out.split(`{${token}}`).join(value)
  }
  const doubleBrace: Record<string, string> = {
    CLIENT_NAME: vars.client_name ?? '',
    COMPANY_NAME: vars.company_name ?? vars.business_name ?? '',
    DEFAULT_EMAIL: vars.contact_email ?? '',
    CURRENT_DATE: vars.current_date ?? '',
  }
  for (const [token, value] of Object.entries(doubleBrace)) {
    out = out.split(`{{${token}}}`).join(value)
  }
  return out
}

function emptySkipped(): BookingReminderDispatchSkippedReasons {
  return {
    bookingReminderDisabled: 0,
    noReminderConfigs: 0,
    dispatchAlreadyRunning: 0,
    noWorkOrderNumber: 0,
    noClientEmail: 0,
    suppressedAfterBookingConfirmationEmail: 0,
    suppressedByManualCustomerReminder: 0,
    alreadySentForSchedule: 0,
    notDueYet: 0,
    missedWindow: 0,
    noScheduledAppointment: 0,
    cancelledWorkOrder: 0,
  }
}

export async function getBookingConfirmationReminderSettings(
  businessId: string
): Promise<BookingReminderSettingsPayload> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      timeZone: true,
      settings: {
        select: {
          id: true,
          bookingRemindersEnabled: true,
          templates: {
            where: {
              templateType: TEMPLATE_TYPE,
              channel: 'EMAIL',
            },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { subject: true, message: true },
          },
        },
      },
      reminderConfigs: {
        where: {
          reminderType: REMINDER_TYPE,
          channel: 'EMAIL',
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          timeValue: true,
          timeUnit: true,
          timeOfDay: true,
          isEnabled: true,
          channel: true,
        },
      },
    },
  })

  const settings = business?.settings
  const templateRow = settings?.templates?.[0]

  const schedules: BookingReminderScheduleRow[] = (business?.reminderConfigs ?? []).map(row => ({
    id: row.id,
    timeValue: row.timeValue,
    timeUnit: row.timeUnit === 'days' ? 'days' : 'hours',
    timeOfDay: row.timeOfDay,
    channel: 'EMAIL',
    enabled: row.isEnabled,
  }))

  return {
    enabled: business?.settings?.bookingRemindersEnabled ?? true,
    schedules,
    template: {
      subject: templateRow?.subject?.trim() || DEFAULT_SUBJECT,
      message: templateRow?.message?.trim() || DEFAULT_MESSAGE,
    },
    uiHint: BOOKING_REMINDER_UI_HINT,
  }
}

export async function updateBookingConfirmationReminderSettings(
  businessId: string,
  input: {
    enabled: boolean
    schedules: BookingReminderScheduleInput[]
    template: BookingReminderTemplateInput
  }
): Promise<BookingReminderSettingsPayload> {
  await prisma.$transaction(async tx => {
    const settings = await tx.businessSettings.upsert({
      where: { businessId },
      create: { businessId, bookingRemindersEnabled: input.enabled },
      update: { bookingRemindersEnabled: input.enabled },
      select: { id: true },
    })

    await tx.reminderConfig.deleteMany({
      where: {
        businessId,
        reminderType: REMINDER_TYPE,
        channel: 'EMAIL',
      },
    })

    for (const row of input.schedules) {
      const timeUnit = row.timeUnit === 'days' ? 'days' : 'hours'
      const timeOfDay = timeUnit === 'days' && row.timeOfDay?.trim() ? row.timeOfDay.trim() : null
      await tx.reminderConfig.create({
        data: {
          businessId,
          reminderType: REMINDER_TYPE,
          timeValue: row.timeValue,
          timeUnit,
          timeOfDay,
          channel: 'EMAIL',
          isEnabled: row.enabled !== false,
          subject: null,
          message: null,
        },
      })
    }

    const existingTemplate = await tx.messageTemplate.findFirst({
      where: {
        settingsId: settings.id,
        templateType: TEMPLATE_TYPE,
        channel: 'EMAIL',
      },
      select: { id: true },
    })

    if (existingTemplate) {
      await tx.messageTemplate.update({
        where: { id: existingTemplate.id },
        data: {
          subject: input.template.subject,
          message: input.template.message,
        },
      })
    } else {
      await tx.messageTemplate.create({
        data: {
          settingsId: settings.id,
          templateType: TEMPLATE_TYPE,
          channel: 'EMAIL',
          subject: input.template.subject,
          message: input.template.message,
          isDefault: true,
        },
      })
    }
  })

  return getBookingConfirmationReminderSettings(businessId)
}

async function hasReminderAlreadySent(workOrderId: string, configId: string): Promise<boolean> {
  const note = `configId:${configId}`
  const found = await prisma.reminderLog.findFirst({
    where: {
      workOrderId,
      reminderType: REMINDER_TYPE,
      note,
    },
    select: { id: true },
  })
  return Boolean(found)
}

async function hasWorkOrderReminderEverSent(workOrderId: string): Promise<boolean> {
  const found = await prisma.reminderLog.findFirst({
    where: {
      workOrderId,
      reminderType: REMINDER_TYPE,
      channel: 'EMAIL',
    },
    select: { id: true },
  })
  return Boolean(found)
}

async function claimReminderSend(params: {
  businessId: string
  workOrderId: string
  clientId: string
  sentAt: Date
  configId: string
}): Promise<{ claimed: true; id: string } | { claimed: false }> {
  // Work-order-wide claim key (not config-specific) to prevent duplicate sends when
  // schedules change or manual dispatch is triggered multiple times.
  const note = `workOrderId:${params.workOrderId}`
  try {
    const created = await prisma.reminderLog.create({
      data: {
        reminderType: REMINDER_TYPE,
        sentAt: params.sentAt,
        channel: 'EMAIL',
        entityType: 'WORK_ORDER',
        entityId: params.workOrderId,
        workOrderId: params.workOrderId,
        clientId: params.clientId,
        businessId: params.businessId,
        note,
      },
      select: { id: true },
    })
    return { claimed: true, id: created.id }
  } catch (error) {
    // Unique constraint prevents duplicates across concurrent dispatch runs.
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { claimed: false }
    }
    throw error
  }
}

function computeWorkOrderWideSkip(params: {
  wo: {
    workOrderNumber: string | null
    bookingConfirmationSentAt: Date | null
    confirmationReminderSentAt: Date | null
    client: { id: string }
  }
  configCount: number
  skippedReasons: BookingReminderDispatchSkippedReasons
}): { processedDelta: number; shouldSkip: boolean } {
  const { wo, configCount, skippedReasons } = params

  if (!wo.workOrderNumber?.trim()) {
    skippedReasons.noWorkOrderNumber += configCount
    return { processedDelta: configCount, shouldSkip: true }
  }
  if (wo.bookingConfirmationSentAt) {
    skippedReasons.suppressedAfterBookingConfirmationEmail += configCount
    return { processedDelta: configCount, shouldSkip: true }
  }
  if (wo.confirmationReminderSentAt) {
    skippedReasons.suppressedByManualCustomerReminder += configCount
    return { processedDelta: configCount, shouldSkip: true }
  }
  return { processedDelta: 0, shouldSkip: false }
}

export async function dispatchBookingConfirmationReminders(
  businessId: string,
  options?: { asOf?: Date; dryRun?: boolean }
): Promise<BookingReminderDispatchResult> {
  const asOf = options?.asOf ?? new Date()
  const dryRun = options?.dryRun ?? false
  const skippedReasons = emptySkipped()

  // Prevent overlapping dispatch runs for the same business (cron + manual dispatch).
  // This avoids duplicate sends when multiple dispatches race before logs are written.
  const lockRows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(hashtext(${businessId})) AS locked
  `
  const locked = lockRows?.[0]?.locked === true
  if (!locked) {
    skippedReasons.dispatchAlreadyRunning = 1
    const skipped = Object.values(skippedReasons).reduce((a, b) => a + b, 0)
    return {
      asOf: asOf.toISOString(),
      dryRun,
      processed: 0,
      sent: 0,
      skipped,
      skippedReasons,
    }
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        email: true,
        timeZone: true,
        settings: {
          select: {
            bookingRemindersEnabled: true,
            replyToEmail: true,
            templates: {
              where: { templateType: TEMPLATE_TYPE, channel: 'EMAIL' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { subject: true, message: true },
            },
          },
        },
        reminderConfigs: {
          where: {
            reminderType: REMINDER_TYPE,
            channel: 'EMAIL',
            isEnabled: true,
          },
          select: {
            id: true,
            timeValue: true,
            timeUnit: true,
            timeOfDay: true,
          },
        },
      },
    })

    if (!business) {
      throw new BusinessNotFoundError()
    }

    const remindersEnabled = business.settings?.bookingRemindersEnabled ?? true
    if (!remindersEnabled) {
      skippedReasons.bookingReminderDisabled = 1
      const skipped = Object.values(skippedReasons).reduce((a, b) => a + b, 0)
      return {
        asOf: asOf.toISOString(),
        dryRun,
        processed: 0,
        sent: 0,
        skipped,
        skippedReasons,
      }
    }

    const configs = business.reminderConfigs
    if (configs.length === 0) {
      skippedReasons.noReminderConfigs = 1
      const skipped = Object.values(skippedReasons).reduce((a, b) => a + b, 0)
      return {
        asOf: asOf.toISOString(),
        dryRun,
        processed: 0,
        sent: 0,
        skipped,
        skippedReasons,
      }
    }

    const templateRow = business.settings?.templates?.[0]
    const subjectTpl = templateRow?.subject?.trim() || DEFAULT_SUBJECT
    const messageTpl = templateRow?.message?.trim() || DEFAULT_MESSAGE
    const tz = business.timeZone?.trim() || 'UTC'

    /**
     * Reminders run only against persisted work orders (not quote-only clients). Jobs must have a
     * assigned work order number — legacy rows without one are skipped. Communications / manual
     * customer reminders suppress automation via `bookingConfirmationSentAt` and
     * `confirmationReminderSentAt`.
     */
    const workOrders = await prisma.workOrder.findMany({
      where: {
        businessId,
        cancelledAt: null,
        scheduledAt: { not: null },
        workOrderNumber: { not: null },
      },
      select: {
        id: true,
        workOrderNumber: true,
        createdAt: true,
        scheduledAt: true,
        bookingConfirmationSentAt: true,
        confirmationReminderSentAt: true,
        client: { select: { id: true, email: true } },
      },
    })

    let processed = 0
    let sent = 0

    for (const wo of workOrders) {
      const n = configs.length
      const woSkip = computeWorkOrderWideSkip({
        wo,
        configCount: n,
        skippedReasons,
      })
      if (woSkip.shouldSkip) {
        processed += woSkip.processedDelta
        continue
      }

      // Ensure "same client + same work order" sends at most once total.
      if (await hasWorkOrderReminderEverSent(wo.id)) {
        skippedReasons.alreadySentForSchedule += n
        processed += n
        continue
      }

      for (const cfg of configs) {
        processed += 1
        if (!wo.scheduledAt) {
          skippedReasons.noScheduledAppointment += 1
          continue
        }
        if (await hasReminderAlreadySent(wo.id, cfg.id)) {
          skippedReasons.alreadySentForSchedule += 1
          continue
        }
        const clientEmail = wo.client.email?.trim()
        if (!clientEmail) {
          skippedReasons.noClientEmail += 1
          continue
        }

        const timeUnit = cfg.timeUnit === 'days' ? 'days' : 'hours'
        const reminderTime = computeReminderTime(
          wo.scheduledAt,
          cfg.timeValue,
          timeUnit,
          cfg.timeOfDay,
          tz
        )

        if (asOf.getTime() < reminderTime.getTime()) {
          skippedReasons.notDueYet += 1
          continue
        }

        /**
         * Missed window: reminder instant was before the work order existed (e.g. "6 hours before"
         * when the job is only 4 hours away — the computed fire time lies in the past vs creation).
         */
        if (reminderTime.getTime() < wo.createdAt.getTime()) {
          skippedReasons.missedWindow += 1
          continue
        }

        if (asOf.getTime() >= wo.scheduledAt.getTime()) {
          skippedReasons.missedWindow += 1
          continue
        }

        const vars = await buildTemplateVarsForWorkOrder(wo.id)
        const subject = applyTemplateTokens(subjectTpl, vars)
        const bodyText = applyTemplateTokens(messageTpl, vars)
        const companyReplyTo = business.settings?.replyToEmail?.trim() || business.email

        if (dryRun) {
          sent += 1
          continue
        }

        // Claim send first to prevent duplicates across overlapping dispatch runs.
        const claim = await claimReminderSend({
          businessId,
          workOrderId: wo.id,
          clientId: wo.client.id,
          sentAt: asOf,
          configId: cfg.id,
        })
        if (!claim.claimed) {
          skippedReasons.alreadySentForSchedule += 1
          continue
        }

        try {
          await emailService.send({
            to: clientEmail,
            subject,
            html: plainTextToHtml(bodyText),
            from: `${business.name} <${process.env.RESEND_FROM_EMAIL ?? 'noresponder@notificaciones.kellu.co'}>`,
            replyTo: companyReplyTo,
          })
        } catch (error) {
          // If sending fails, remove the claim so a future dispatch can retry.
          await prisma.reminderLog.delete({ where: { id: claim.id } }).catch(() => null)
          throw error
        }
        sent += 1
      }
    }

    const skipped = Object.values(skippedReasons).reduce((a, b) => a + b, 0)

    return {
      asOf: asOf.toISOString(),
      dryRun,
      processed,
      sent,
      skipped,
      skippedReasons,
    }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${businessId}))`.catch(() => null)
  }
}

export async function triggerBookingConfirmationRemindersForAllBusinesses(): Promise<number> {
  const businesses = await prisma.business.findMany({ select: { id: true } })
  let totalSent = 0
  for (const b of businesses) {
    const r = await dispatchBookingConfirmationReminders(b.id, { dryRun: false })
    totalSent += r.sent
  }
  return totalSent
}
