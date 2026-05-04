/**
 * Quote follow-up email reminders (settings schedules + template).
 * Only EMAIL. Dispatched only when QuoteStatus is AWAITING_RESPONSE and quoteSentAt is set.
 */

import { type Prisma, QuoteStatus, ReminderType, TemplateType } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { getBookingReminderTemplateVariablesResponse } from '~/services/booking-confirmation-reminders.service'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'

export const getQuoteReminderTemplateVariablesResponse = getBookingReminderTemplateVariablesResponse

const REMINDER_TYPE = ReminderType.QUOTE_REMINDER
const TEMPLATE_TYPE = TemplateType.QUOTE_FOLLOW_UP

const DEFAULT_SUBJECT = 'Scheduled reminder: Quote reminders'
const DEFAULT_MESSAGE = `Hi {client_name},

Reminder about your quote. Please let us know if you have any questions.

Thanks,`

export const QUOTE_REMINDER_UI_HINT =
  'Reminders are sent after the quote email was sent, using your business timezone for day-based schedules.'

export interface QuoteReminderScheduleInput {
  id?: string
  timeValue: number
  timeUnit: 'hours' | 'days'
  timeOfDay?: string | null
  enabled?: boolean
}

export interface QuoteReminderTemplateInput {
  subject: string
  message: string
}

export interface QuoteReminderScheduleRow {
  id: string
  timeValue: number
  timeUnit: 'hours' | 'days'
  timeOfDay: string | null
  channel: 'EMAIL'
  enabled: boolean
}

export interface QuoteReminderSettingsPayload {
  enabled: boolean
  schedules: QuoteReminderScheduleRow[]
  template: { subject: string; message: string }
  uiHint: string
}

export interface QuoteReminderDispatchSkippedReasons {
  quoteRemindersDisabled: number
  noReminderConfigs: number
  noClientEmail: number
  alreadySentForSchedule: number
  notDueYet: number
  noQuoteSentAt: number
}

export interface QuoteReminderDispatchResult {
  asOf: string
  dryRun: boolean
  processed: number
  sent: number
  skipped: number
  skippedReasons: QuoteReminderDispatchSkippedReasons
}

type TemplateVarPayload = Record<string, string>

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

/** Wall-clock instant: quoteSentAt + offset (hours or calendar days in business TZ). */
function computeQuoteFollowUpTime(
  quoteSentAt: Date,
  timeValue: number,
  timeUnit: 'hours' | 'days',
  timeOfDay: string | null | undefined,
  businessTimeZone: string
): Date {
  if (timeUnit === 'hours') {
    return new Date(quoteSentAt.getTime() + timeValue * 60 * 60 * 1000)
  }

  const parsed = timeOfDay?.trim() ? parseTimeOfDay(timeOfDay) : null
  const TemporalApi = (globalThis as { Temporal?: Record<string, unknown> }).Temporal as
    | undefined
    | {
        Instant: {
          fromEpochMilliseconds: (ms: number) => {
            toZonedDateTimeISO: (tz: string) => {
              toPlainDate: () => { add: (x: { days: number }) => PlainDateLike }
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
      const sentZ = TemporalApi.Instant.fromEpochMilliseconds(
        quoteSentAt.getTime()
      ).toZonedDateTimeISO(tz)
      const baseDate = sentZ.toPlainDate()
      const targetDay = baseDate.add({ days: timeValue }) as PlainDateLike
      const plainTime = parsed
        ? TemporalApi.PlainTime.from({ hour: parsed.hour, minute: parsed.minute })
        : TemporalApi.PlainTime.from({ hour: 0, minute: 0 })
      const zdt = targetDay.toZonedDateTime({ timeZone: tz, plainTime })
      return new Date(zdt.epochMilliseconds)
    } catch {
      // fall through
    }
  }

  const d = new Date(quoteSentAt.getTime() + timeValue * 24 * 60 * 60 * 1000)
  if (parsed) {
    d.setHours(parsed.hour, parsed.minute, 0, 0)
  } else {
    d.setHours(0, 0, 0, 0)
  }
  return d
}

async function buildTemplateVarsForQuote(quoteId: string): Promise<TemplateVarPayload> {
  const q = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      title: true,
      address: true,
      quoteNumber: true,
      quoteSentAt: true,
      scheduledAt: true,
      startTime: true,
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
    },
  })
  if (!q?.client) {
    return {}
  }
  const lineItems = joinLineItemsForTemplate(q.lineItems)
  const preferredEmail = q.client.business.settings?.replyToEmail?.trim() || q.client.business.email
  const currentDate = formatDateForTemplate(new Date())

  return {
    current_date: currentDate,
    client_name: q.client.name,
    company_info: q.client.business.name,
    company_name: q.client.business.name,
    business_name: q.client.business.name,
    contact_email: preferredEmail,
    phone_number: q.client.business.phone?.trim() || '',
    line_items: lineItems,
    discount_amount: formatMoneyForTemplate(q.discount ?? 0),
    total: formatMoneyForTemplate(q.total ?? 0),
    payment_amount: formatMoneyForTemplate(q.amountPaid ?? 0),
    balance: formatMoneyForTemplate(q.balance ?? 0),
    quote_number: q.quoteNumber ?? '',
    quote_sent_date: formatDateForTemplate(q.quoteSentAt),
    workorder_number: '',
    arrival_window:
      q.startTime && q.scheduledAt
        ? `${formatDateForTemplate(q.scheduledAt)} ${q.startTime}`
        : formatDateForTemplate(q.scheduledAt),
    job_date: formatDateForTemplate(q.scheduledAt),
    job_date_time: formatDateTimeForTemplate(q.scheduledAt, q.startTime),
    job_address: q.address ?? '',
    job_title: q.title ?? '',
    invoice_number: '',
    invoice_sent_date: '',
    due_date: '',
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

function emptySkipped(): QuoteReminderDispatchSkippedReasons {
  return {
    quoteRemindersDisabled: 0,
    noReminderConfigs: 0,
    noClientEmail: 0,
    alreadySentForSchedule: 0,
    notDueYet: 0,
    noQuoteSentAt: 0,
  }
}

const DEFAULT_VIRTUAL_SCHEDULES: QuoteReminderScheduleRow[] = [
  {
    id: 'virtual-default-48h',
    timeValue: 48,
    timeUnit: 'hours',
    timeOfDay: null,
    channel: 'EMAIL',
    enabled: true,
  },
  {
    id: 'virtual-default-5d',
    timeValue: 5,
    timeUnit: 'days',
    timeOfDay: '08:00 AM',
    channel: 'EMAIL',
    enabled: true,
  },
]

export async function getQuoteReminderSettings(
  businessId: string
): Promise<QuoteReminderSettingsPayload> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      timeZone: true,
      settings: {
        select: {
          id: true,
          quoteRemindersEnabled: true,
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

  const templateRow = business?.settings?.templates?.[0]

  const dbSchedules: QuoteReminderScheduleRow[] = (business?.reminderConfigs ?? []).map(row => ({
    id: row.id,
    timeValue: row.timeValue,
    timeUnit: row.timeUnit === 'days' ? 'days' : 'hours',
    timeOfDay: row.timeOfDay,
    channel: 'EMAIL',
    enabled: row.isEnabled,
  }))

  const schedules = dbSchedules.length > 0 ? dbSchedules : DEFAULT_VIRTUAL_SCHEDULES

  return {
    enabled: business?.settings?.quoteRemindersEnabled ?? true,
    schedules,
    template: {
      subject: templateRow?.subject?.trim() || DEFAULT_SUBJECT,
      message: templateRow?.message?.trim() || DEFAULT_MESSAGE,
    },
    uiHint: QUOTE_REMINDER_UI_HINT,
  }
}

export async function updateQuoteReminderSettings(
  businessId: string,
  input: {
    enabled: boolean
    schedules: QuoteReminderScheduleInput[]
    template: QuoteReminderTemplateInput
  }
): Promise<QuoteReminderSettingsPayload> {
  await prisma.$transaction(async tx => {
    const settings = await tx.businessSettings.upsert({
      where: { businessId },
      create: { businessId, quoteRemindersEnabled: input.enabled },
      update: { quoteRemindersEnabled: input.enabled },
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
      const tv = Math.max(1, Math.min(timeUnit === 'hours' ? 720 : 365, row.timeValue))
      await tx.reminderConfig.create({
        data: {
          businessId,
          reminderType: REMINDER_TYPE,
          timeValue: tv,
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

  return getQuoteReminderSettings(businessId)
}

async function hasQuoteReminderAlreadySent(quoteId: string, configId: string): Promise<boolean> {
  const note = `configId:${configId}`
  const found = await prisma.reminderLog.findFirst({
    where: {
      entityType: 'QUOTE',
      entityId: quoteId,
      reminderType: REMINDER_TYPE,
      note,
    },
    select: { id: true },
  })
  return Boolean(found)
}

export async function dispatchQuoteReminders(
  businessId: string,
  options?: { asOf?: Date; dryRun?: boolean }
): Promise<QuoteReminderDispatchResult> {
  const asOf = options?.asOf ?? new Date()
  const dryRun = options?.dryRun ?? false
  const skippedReasons = emptySkipped()

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      email: true,
      timeZone: true,
      settings: {
        select: {
          quoteRemindersEnabled: true,
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

  const remindersEnabled = business.settings?.quoteRemindersEnabled ?? true
  if (!remindersEnabled) {
    skippedReasons.quoteRemindersDisabled = 1
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

  const quotes = await prisma.quote.findMany({
    where: {
      businessId,
      quoteStatus: QuoteStatus.AWAITING_RESPONSE,
      quoteSentAt: { not: null },
    },
    select: {
      id: true,
      quoteSentAt: true,
      client: { select: { id: true, email: true } },
    },
  })

  let processed = 0
  let sent = 0

  for (const quote of quotes) {
    for (const cfg of configs) {
      processed += 1
      const sentAt = quote.quoteSentAt
      if (!sentAt) {
        skippedReasons.noQuoteSentAt += 1
        continue
      }

      if (await hasQuoteReminderAlreadySent(quote.id, cfg.id)) {
        skippedReasons.alreadySentForSchedule += 1
        continue
      }

      const clientEmail = quote.client.email?.trim()
      if (!clientEmail) {
        skippedReasons.noClientEmail += 1
        continue
      }

      const timeUnit = cfg.timeUnit === 'days' ? 'days' : 'hours'
      const reminderTime = computeQuoteFollowUpTime(
        sentAt,
        cfg.timeValue,
        timeUnit,
        cfg.timeOfDay,
        tz
      )

      if (asOf.getTime() < reminderTime.getTime()) {
        skippedReasons.notDueYet += 1
        continue
      }

      const vars = await buildTemplateVarsForQuote(quote.id)
      const subject = applyTemplateTokens(subjectTpl, vars)
      const bodyText = applyTemplateTokens(messageTpl, vars)
      const companyReplyTo = business.settings?.replyToEmail?.trim() || business.email

      if (dryRun) {
        sent += 1
        continue
      }

      await emailService.send({
        to: clientEmail,
        subject,
        html: plainTextToHtml(bodyText),
        from: `${business.name} <${process.env.RESEND_FROM_EMAIL ?? 'noresponder@notificaciones.kellu.co'}>`,
        replyTo: companyReplyTo,
      })

      await prisma.reminderLog.create({
        data: {
          reminderType: REMINDER_TYPE,
          sentAt: asOf,
          channel: 'EMAIL',
          entityType: 'QUOTE',
          entityId: quote.id,
          workOrderId: null,
          clientId: quote.client.id,
          businessId,
          note: `configId:${cfg.id}`,
        },
      })
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
}

export async function triggerQuoteRemindersForAllBusinesses(): Promise<number> {
  const businesses = await prisma.business.findMany({ select: { id: true } })
  let totalSent = 0
  for (const b of businesses) {
    const r = await dispatchQuoteReminders(b.id, { dryRun: false })
    totalSent += r.sent
  }
  return totalSent
}
