/**
 * Company Settings (Profile & Company Settings §13.1).
 * GET/PATCH current business profile + BusinessSettings for Reply list, Due dates,
 * Company details, Bank details, Terms, Arrival window, WhatsApp, Tax.
 */

import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'
import { clientToCustomerFrom } from '~/services/email-helpers'

export const DEFAULT_QUOTE_TERMS_CONDITIONS = `This quote is valid for 7 days from the issue date. Work will begin once the quote is approved. Any additional work requested outside the quoted scope may be billed separately.`

export const DEFAULT_INVOICE_TERMS_CONDITIONS = `Payment is due within 3 days of invoice date unless otherwise agreed in writing. Late payments may be subject to service delays. Please include the invoice number with your payment for faster processing.`

export interface CurrentSettingsResult {
  /** Personal profile (owner user) */
  personalProfile: {
    fullName: string | null
    email: string
  }
  /** Company profile (Business) – used on quotes, invoices, communications */
  company: {
    id: string
    name: string
    legalName: string | null
    email: string
    phone: string | null
    webpage: string | null
    address: string | null
    street1: string | null
    street2: string | null
    city: string | null
    state: string | null
    zipcode: string | null
    logoUrl: string | null
    primaryColor: string | null
    secondaryColor: string | null
    rutNumber: string | null
  }
  /** Company settings (Reply list, Due dates, Bank, Terms, Arrival, WhatsApp, Tax) */
  settings: {
    replyToEmail: string | null
    quoteExpirationDays: number
    invoiceDueDays: number
    arrivalWindowHours: number | null
    arrivalWindowMinutes: number | null
    defaultDurationMinutes: number | null
    bankName: string | null
    accountType: string | null
    accountNumber: string | null
    paymentEmail: string | null
    onlinePaymentLink: string | null
    quoteTermsConditions: string | null
    invoiceTermsConditions: string | null
    whatsappSender: string | null
    defaultTaxRate: number | null
    taxIdRut: string | null
    sendTeamPhotosWithConfirmation: boolean
    timeZone: string | null
  }
}

export interface UpdateSettingsInput {
  // Personal profile (owner)
  fullName?: string
  email?: string
  // Company (Business)
  name?: string
  legalName?: string | null
  companyEmail?: string
  phone?: string | null
  webpage?: string | null
  address?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  logoUrl?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  rutNumber?: string | null
  // Settings (Reply list, Due dates, Bank, Terms, Arrival, WhatsApp, Tax)
  replyToEmail?: string | null
  quoteExpirationDays?: number
  invoiceDueDays?: number
  arrivalWindowHours?: number | null
  bankName?: string | null
  accountType?: string | null
  accountNumber?: string | null
  paymentEmail?: string | null
  onlinePaymentLink?: string | null
  quoteTermsConditions?: string | null
  invoiceTermsConditions?: string | null
  whatsappSender?: string | null
  defaultTaxRate?: number | null
  taxIdRut?: string | null
  sendTeamPhotosWithConfirmation?: boolean
  timeZone?: string | null
}

export interface ScheduleColorAssignee {
  memberId: string
  name: string
  email: string
  color: string | null
}

export interface ScheduleColorUpdateInput {
  memberId: string
  color: string | null
}

export interface DispatchBookingConfirmationRemindersInput {
  asOf?: Date
  dryRun?: boolean
}

export interface BookingConfirmationReminderScheduleItem {
  id: string
  timeValue: number
  timeUnit: 'hours' | 'days'
  timeOfDay: string | null
  channel: 'EMAIL'
  isEnabled: boolean
}

export interface BookingConfirmationReminderTemplate {
  subject: string
  message: string
}

export interface BookingConfirmationReminderSettingsResult {
  enabled: boolean
  schedules: BookingConfirmationReminderScheduleItem[]
  template: BookingConfirmationReminderTemplate
}

export interface UpdateBookingConfirmationReminderSettingsInput {
  enabled?: boolean
  schedules?: Array<{
    id?: string
    timeValue: number
    timeUnit: 'hours' | 'days'
    timeOfDay?: string | null
    enabled?: boolean
  }>
  template?: {
    subject?: string
    message?: string
  }
}

export interface DispatchBookingConfirmationRemindersResult {
  asOf: Date
  dryRun: boolean
  processed: number
  sent: number
  skipped: number
  skippedReasons: {
    bookingReminderDisabled: number
    noReminderConfigs: number
    noClientEmail: number
    alreadySentForSchedule: number
    notDueYet: number
    missedWindow: number
  }
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

function parseTimeOfDayToHoursMinutes(timeOfDay: string | null | undefined): {
  hours: number
  minutes: number
} | null {
  if (!timeOfDay) {
    return null
  }
  const match = timeOfDay.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) {
    return null
  }
  let hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  const meridiem = match[3]?.toUpperCase()
  if (meridiem) {
    if (hours === 12) {
      hours = meridiem === 'AM' ? 0 : 12
    } else if (meridiem === 'PM') {
      hours += 12
    }
  }
  return { hours, minutes }
}

function computeReminderAt(params: {
  scheduledAt: Date
  timeValue: number
  timeUnit: string
  timeOfDay?: string | null
}): Date {
  const base = new Date(params.scheduledAt)
  const unit = params.timeUnit.toLowerCase()
  if (unit.startsWith('hour')) {
    base.setHours(base.getHours() - params.timeValue)
    return base
  }
  if (unit.startsWith('day')) {
    base.setDate(base.getDate() - params.timeValue)
    const parsedTime = parseTimeOfDayToHoursMinutes(params.timeOfDay)
    if (parsedTime) {
      base.setHours(parsedTime.hours, parsedTime.minutes, 0, 0)
    }
    return base
  }
  // Unknown unit fallback: treat as hours-before.
  base.setHours(base.getHours() - params.timeValue)
  return base
}

function renderReminderTemplate(
  template: { subject: string; message: string },
  params: {
    clientName: string
    businessName: string
    workOrderTitle: string
    scheduledAt: Date
  }
): { subject: string; html: string } {
  const dateText = params.scheduledAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeText = params.scheduledAt.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const tokenMap: Record<string, string> = {
    client_name: params.clientName,
    business_name: params.businessName,
    work_order_title: params.workOrderTitle,
    appointment_date: dateText,
    appointment_time: timeText,
  }
  const applyTokens = (input: string): string => {
    let output = input
    for (const [token, value] of Object.entries(tokenMap)) {
      output = output.split(`{${token}}`).join(value)
    }
    return output
  }
  const subject = applyTokens(template.subject)
  const messageText = applyTokens(template.message)
  const html = messageText
    .split('\n')
    .map(line => (line.trim().length > 0 ? `<p>${line}</p>` : '<br/>'))
    .join('')
  return { subject, html }
}

function normalizeReminderConfigTimeUnit(timeUnit: string): 'hours' | 'days' {
  return timeUnit.toLowerCase().startsWith('day') ? 'days' : 'hours'
}

function normalizeReminderConfigTimeOfDay(value: string | null): string | null {
  const parsed = parseTimeOfDayToHoursMinutes(value)
  if (!parsed) {
    return null
  }
  const d = new Date()
  d.setHours(parsed.hours, parsed.minutes, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export async function getBookingConfirmationReminderSettings(
  businessId: string
): Promise<BookingConfirmationReminderSettingsResult> {
  await ensureBusinessExists(businessId)
  const [settings, configs, template] = await Promise.all([
    prisma.businessSettings.findUnique({
      where: { businessId },
      select: { bookingRemindersEnabled: true },
    }),
    prisma.reminderConfig.findMany({
      where: { businessId, reminderType: 'BOOKING_CONFIRMATION' },
      orderBy: [{ timeValue: 'asc' }, { updatedAt: 'asc' }],
      select: {
        id: true,
        timeValue: true,
        timeUnit: true,
        timeOfDay: true,
        isEnabled: true,
      },
    }),
    prisma.messageTemplate.findFirst({
      where: {
        settings: { businessId },
        templateType: 'BOOKING_CONFIRMATION_REMINDER',
        channel: 'EMAIL',
      },
      orderBy: { updatedAt: 'desc' },
      select: { subject: true, message: true },
    }),
  ])

  return {
    enabled: settings?.bookingRemindersEnabled ?? true,
    schedules: configs.map(item => ({
      id: item.id,
      timeValue: item.timeValue,
      timeUnit: normalizeReminderConfigTimeUnit(item.timeUnit),
      timeOfDay: normalizeReminderConfigTimeOfDay(item.timeOfDay),
      channel: 'EMAIL',
      isEnabled: item.isEnabled,
    })),
    template: {
      subject: template?.subject?.trim() || 'Scheduled reminder: Booking confirmation',
      message:
        template?.message?.trim() ||
        'Hi {client_name},\n\nReminder about your upcoming appointment.\n\nThanks,\n{business_name}',
    },
  }
}

export async function updateBookingConfirmationReminderSettings(
  businessId: string,
  input: UpdateBookingConfirmationReminderSettingsInput
): Promise<BookingConfirmationReminderSettingsResult> {
  await ensureBusinessExists(businessId)

  if (input.enabled !== undefined) {
    await prisma.businessSettings.upsert({
      where: { businessId },
      create: { businessId, bookingRemindersEnabled: input.enabled },
      update: { bookingRemindersEnabled: input.enabled },
    })
  }

  if (input.schedules !== undefined) {
    const existingIds = new Set(
      (
        await prisma.reminderConfig.findMany({
          where: { businessId, reminderType: 'BOOKING_CONFIRMATION' },
          select: { id: true },
        })
      ).map(item => item.id)
    )

    const incomingIds = new Set(input.schedules.map(item => item.id).filter(Boolean) as string[])
    const toDelete = Array.from(existingIds).filter(id => !incomingIds.has(id))
    if (toDelete.length > 0) {
      await prisma.reminderConfig.deleteMany({
        where: { businessId, reminderType: 'BOOKING_CONFIRMATION', id: { in: toDelete } },
      })
    }

    for (const schedule of input.schedules) {
      const timeUnit = schedule.timeUnit === 'days' ? 'day' : 'hour'
      const timeOfDay = schedule.timeUnit === 'days' ? (schedule.timeOfDay ?? null) : null
      if (schedule.id && existingIds.has(schedule.id)) {
        await prisma.reminderConfig.update({
          where: { id: schedule.id },
          data: {
            timeValue: schedule.timeValue,
            timeUnit,
            timeOfDay,
            isEnabled: schedule.enabled ?? true,
            channel: 'EMAIL',
          },
        })
      } else {
        await prisma.reminderConfig.create({
          data: {
            businessId,
            reminderType: 'BOOKING_CONFIRMATION',
            timeValue: schedule.timeValue,
            timeUnit,
            timeOfDay,
            channel: 'EMAIL',
            isEnabled: schedule.enabled ?? true,
          },
        })
      }
    }
  }

  if (input.template !== undefined) {
    const settings = await prisma.businessSettings.upsert({
      where: { businessId },
      create: { businessId },
      update: {},
      select: { id: true },
    })
    const existing = await prisma.messageTemplate.findFirst({
      where: {
        settingsId: settings.id,
        templateType: 'BOOKING_CONFIRMATION_REMINDER',
        channel: 'EMAIL',
      },
      select: { id: true },
    })
    if (existing) {
      await prisma.messageTemplate.update({
        where: { id: existing.id },
        data: {
          ...(input.template.subject !== undefined && { subject: input.template.subject }),
          ...(input.template.message !== undefined && { message: input.template.message }),
          isDefault: false,
        },
      })
    } else {
      await prisma.messageTemplate.create({
        data: {
          settingsId: settings.id,
          templateType: 'BOOKING_CONFIRMATION_REMINDER',
          channel: 'EMAIL',
          subject: input.template.subject ?? 'Scheduled reminder: Booking confirmation',
          message:
            input.template.message ??
            'Hi {client_name},\n\nReminder about your upcoming appointment.\n\nThanks,\n{business_name}',
          isDefault: false,
        },
      })
    }
  }

  return getBookingConfirmationReminderSettings(businessId)
}

export async function dispatchBookingConfirmationReminders(
  businessId: string,
  input: DispatchBookingConfirmationRemindersInput = {}
): Promise<DispatchBookingConfirmationRemindersResult> {
  await ensureBusinessExists(businessId)
  const asOf = input.asOf ?? new Date()
  const dryRun = input.dryRun ?? false

  const result: DispatchBookingConfirmationRemindersResult = {
    asOf,
    dryRun,
    processed: 0,
    sent: 0,
    skipped: 0,
    skippedReasons: {
      bookingReminderDisabled: 0,
      noReminderConfigs: 0,
      noClientEmail: 0,
      alreadySentForSchedule: 0,
      notDueYet: 0,
      missedWindow: 0,
    },
  }

  const [settings, reminderConfigs, business] = await Promise.all([
    prisma.businessSettings.findUnique({
      where: { businessId },
      select: { bookingRemindersEnabled: true, replyToEmail: true },
    }),
    prisma.reminderConfig.findMany({
      where: {
        businessId,
        reminderType: 'BOOKING_CONFIRMATION',
        isEnabled: true,
        channel: { in: ['EMAIL', 'BOTH'] },
      },
      orderBy: [{ timeValue: 'desc' }, { updatedAt: 'asc' }],
    }),
    prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, email: true },
    }),
  ])

  if (!business) {
    throw new BusinessNotFoundError()
  }

  if (settings?.bookingRemindersEnabled === false) {
    result.skippedReasons.bookingReminderDisabled += 1
    return result
  }

  if (reminderConfigs.length === 0) {
    result.skippedReasons.noReminderConfigs += 1
    return result
  }

  const template = await prisma.messageTemplate.findFirst({
    where: {
      settings: { businessId },
      templateType: 'BOOKING_CONFIRMATION_REMINDER',
      channel: { in: ['EMAIL', 'BOTH'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { subject: true, message: true },
  })
  const templatePayload = {
    subject: template?.subject?.trim() || 'Scheduled reminder: Booking confirmation',
    message:
      template?.message?.trim() ||
      'Hi {client_name},\n\nReminder about your upcoming appointment.\n\nThanks,\n{business_name}',
  }

  const workOrders = await prisma.workOrder.findMany({
    where: {
      businessId,
      scheduledAt: { not: null },
      client: { email: { not: null } },
    },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      client: { select: { id: true, name: true, email: true } },
    },
  })

  const existingLogs = await prisma.reminderLog.findMany({
    where: {
      businessId,
      reminderType: 'BOOKING_CONFIRMATION',
      workOrderId: { in: workOrders.map(item => item.id) },
    },
    select: { workOrderId: true, note: true },
  })
  const sentKeys = new Set(
    existingLogs
      .map(item => {
        const configId = item.note?.match(/configId:([a-zA-Z0-9]+)/)?.[1]
        if (!item.workOrderId || !configId) {
          return null
        }
        return `${item.workOrderId}:${configId}`
      })
      .filter((value): value is string => value != null)
  )

  for (const workOrder of workOrders) {
    if (!workOrder.scheduledAt) {
      continue
    }
    const clientEmail = workOrder.client.email?.trim()
    if (!clientEmail) {
      result.skipped += 1
      result.skippedReasons.noClientEmail += 1
      continue
    }

    for (const config of reminderConfigs) {
      result.processed += 1
      const dedupeKey = `${workOrder.id}:${config.id}`
      if (sentKeys.has(dedupeKey)) {
        result.skipped += 1
        result.skippedReasons.alreadySentForSchedule += 1
        continue
      }

      const reminderAt = computeReminderAt({
        scheduledAt: workOrder.scheduledAt,
        timeValue: config.timeValue,
        timeUnit: config.timeUnit,
        timeOfDay: config.timeOfDay,
      })
      if (reminderAt.getTime() > asOf.getTime()) {
        result.skipped += 1
        result.skippedReasons.notDueYet += 1
        continue
      }
      // If current time is already after reminder time, skip (no late sends).
      if (asOf.getTime() > reminderAt.getTime()) {
        result.skipped += 1
        result.skippedReasons.missedWindow += 1
        continue
      }

      if (!dryRun) {
        const rendered = renderReminderTemplate(templatePayload, {
          clientName: workOrder.client.name,
          businessName: business.name,
          workOrderTitle: workOrder.title,
          scheduledAt: workOrder.scheduledAt,
        })
        await emailService.send({
          to: clientEmail,
          subject: rendered.subject,
          html: rendered.html,
          from: clientToCustomerFrom(business.name),
          replyTo: settings?.replyToEmail?.trim() || business.email,
        })
        await prisma.reminderLog.create({
          data: {
            reminderType: 'BOOKING_CONFIRMATION',
            sentAt: asOf,
            channel: 'EMAIL',
            entityType: 'WORK_ORDER',
            entityId: workOrder.id,
            workOrderId: workOrder.id,
            clientId: workOrder.client.id,
            businessId,
            note: `configId:${config.id}`,
          },
        })
      }

      result.sent += 1
      sentKeys.add(dedupeKey)
    }
  }

  return result
}

export async function dispatchBookingConfirmationRemindersForAllBusinesses(
  input: DispatchBookingConfirmationRemindersInput = {}
): Promise<number> {
  const businesses = await prisma.business.findMany({
    select: { id: true },
  })
  let sent = 0
  for (const business of businesses) {
    const res = await dispatchBookingConfirmationReminders(business.id, input)
    sent += res.sent
  }
  return sent
}

/** Get current business settings (profile + company + settings) for the logged-in user's business. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: response mapping object intentionally explicit for API contract clarity
export async function getCurrentBusinessSettings(
  businessId: string
): Promise<CurrentSettingsResult> {
  await ensureBusinessExists(businessId)

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      owner: { select: { name: true, email: true } },
      settings: true,
    },
  })

  if (!business) {
    throw new BusinessNotFoundError()
  }

  const settings = business.settings

  return {
    personalProfile: {
      fullName: business.owner?.name ?? null,
      email: business.owner?.email ?? business.email,
    },
    company: {
      id: business.id,
      name: business.name,
      legalName: business.legalName,
      email: business.email,
      phone: business.phone,
      webpage: business.webpage,
      address: business.address,
      street1: business.street1,
      street2: business.street2,
      city: business.city,
      state: business.state,
      zipcode: business.zipcode,
      logoUrl: business.logoUrl,
      primaryColor: business.primaryColor,
      secondaryColor: business.secondaryColor,
      rutNumber: business.rutNumber,
    },
    settings: {
      replyToEmail: settings?.replyToEmail?.trim() || business.email || null,
      quoteExpirationDays: settings?.quoteExpirationDays ?? 7,
      invoiceDueDays: settings?.invoiceDueDays ?? 3,
      arrivalWindowHours: settings?.arrivalWindowHours ?? null,
      arrivalWindowMinutes: settings?.arrivalWindowMinutes ?? null,
      defaultDurationMinutes: settings?.defaultDurationMinutes ?? null,
      bankName: settings?.bankName ?? null,
      accountType: settings?.accountType ?? null,
      accountNumber: settings?.accountNumber ?? null,
      paymentEmail: settings?.paymentEmail ?? null,
      onlinePaymentLink: settings?.onlinePaymentLink ?? null,
      quoteTermsConditions:
        settings?.quoteTermsConditions?.trim() || DEFAULT_QUOTE_TERMS_CONDITIONS,
      invoiceTermsConditions:
        settings?.invoiceTermsConditions?.trim() || DEFAULT_INVOICE_TERMS_CONDITIONS,
      whatsappSender: settings?.whatsappSender ?? null,
      defaultTaxRate: settings?.defaultTaxRate != null ? Number(settings.defaultTaxRate) : null,
      taxIdRut: settings?.rutNumber ?? null,
      sendTeamPhotosWithConfirmation: settings?.sendTeamPhotosWithConfirmation ?? false,
      timeZone: business.timeZone ?? null,
    },
  }
}

/** Update current business profile and/or settings. Creates BusinessSettings if missing. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: many optional independent patch fields for business/settings payload
export async function updateCurrentBusinessSettings(
  businessId: string,
  input: UpdateSettingsInput
): Promise<CurrentSettingsResult> {
  await ensureBusinessExists(businessId)

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { owner: true, settings: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  // Owner (personal profile)
  if ((input.fullName !== undefined || input.email !== undefined) && business.ownerId) {
    const ownerData: Prisma.UserUpdateInput = {}
    if (input.fullName !== undefined) {
      ownerData.name = input.fullName
    }
    if (input.email !== undefined) {
      ownerData.email = input.email
    }
    if (Object.keys(ownerData).length > 0) {
      await prisma.user.update({
        where: { id: business.ownerId },
        data: ownerData,
      })
    }
  }

  // Business (company profile)
  const businessData: Prisma.BusinessUpdateInput = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.legalName !== undefined && { legalName: input.legalName }),
    ...(input.companyEmail !== undefined && { email: input.companyEmail }),
    ...(input.timeZone !== undefined && input.timeZone !== null && { timeZone: input.timeZone }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.webpage !== undefined && { webpage: input.webpage }),
    ...(input.address !== undefined && { address: input.address }),
    ...(input.street1 !== undefined && { street1: input.street1 }),
    ...(input.street2 !== undefined && { street2: input.street2 }),
    ...(input.city !== undefined && { city: input.city }),
    ...(input.state !== undefined && { state: input.state }),
    ...(input.zipcode !== undefined && { zipcode: input.zipcode }),
    ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
    ...(input.primaryColor !== undefined && { primaryColor: input.primaryColor }),
    ...(input.secondaryColor !== undefined && { secondaryColor: input.secondaryColor }),
    ...(input.rutNumber !== undefined && { rutNumber: input.rutNumber }),
  }
  if (Object.keys(businessData).length > 0) {
    await prisma.business.update({
      where: { id: businessId },
      data: businessData,
    })
  }

  // BusinessSettings (reply list, due dates, bank, terms, arrival, whatsapp, tax)
  const settingsInput = {
    ...(input.replyToEmail !== undefined && { replyToEmail: input.replyToEmail }),
    ...(input.quoteExpirationDays !== undefined && {
      quoteExpirationDays: input.quoteExpirationDays,
    }),
    ...(input.invoiceDueDays !== undefined && { invoiceDueDays: input.invoiceDueDays }),
    ...(input.arrivalWindowHours !== undefined && {
      arrivalWindowHours:
        input.arrivalWindowHours != null
          ? Math.min(4, Math.max(1, input.arrivalWindowHours))
          : null,
    }),
    ...(input.bankName !== undefined && { bankName: input.bankName }),
    ...(input.accountType !== undefined && { accountType: input.accountType }),
    ...(input.accountNumber !== undefined && { accountNumber: input.accountNumber }),
    ...(input.paymentEmail !== undefined && { paymentEmail: input.paymentEmail }),
    ...(input.onlinePaymentLink !== undefined && { onlinePaymentLink: input.onlinePaymentLink }),
    ...(input.quoteTermsConditions !== undefined && {
      quoteTermsConditions: input.quoteTermsConditions,
    }),
    ...(input.invoiceTermsConditions !== undefined && {
      invoiceTermsConditions: input.invoiceTermsConditions,
    }),
    ...(input.whatsappSender !== undefined && { whatsappSender: input.whatsappSender }),
    ...(input.defaultTaxRate !== undefined && {
      defaultTaxRate:
        input.defaultTaxRate != null ? new Prisma.Decimal(input.defaultTaxRate) : null,
    }),
    ...(input.taxIdRut !== undefined && { rutNumber: input.taxIdRut }),
    ...(input.sendTeamPhotosWithConfirmation !== undefined && {
      sendTeamPhotosWithConfirmation: input.sendTeamPhotosWithConfirmation,
    }),
  }

  if (Object.keys(settingsInput).length > 0) {
    await prisma.businessSettings.upsert({
      where: { businessId },
      create: {
        businessId,
        ...settingsInput,
      },
      update: settingsInput,
    })
  }

  // Keep work orders aligned with latest business-level quote/invoice terms when settings change.
  if (input.quoteTermsConditions !== undefined || input.invoiceTermsConditions !== undefined) {
    await prisma.workOrder.updateMany({
      where: { businessId },
      data: {
        ...(input.quoteTermsConditions !== undefined && {
          quoteTermsConditions: input.quoteTermsConditions,
        }),
        ...(input.invoiceTermsConditions !== undefined && {
          invoiceTermsConditions: input.invoiceTermsConditions,
        }),
      },
    })
  }

  const result = await getCurrentBusinessSettings(businessId)
  return result
}

/** Schedule settings: list active team members and their calendar colors. */
export async function listScheduleColors(businessId: string): Promise<ScheduleColorAssignee[]> {
  await ensureBusinessExists(businessId)

  const members = await prisma.member.findMany({
    where: { businessId, isActive: true },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return members.map(m => ({
    memberId: m.id,
    name: m.user.name ?? 'Unknown',
    email: m.user.email,
    color: m.calendarColor ?? null,
  }))
}

/** Schedule settings: assign/update one team member calendar color. */
export async function updateScheduleColor(
  businessId: string,
  input: ScheduleColorUpdateInput
): Promise<ScheduleColorAssignee> {
  await ensureBusinessExists(businessId)

  const member = await prisma.member.findFirst({
    where: { id: input.memberId, businessId, isActive: true },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })
  if (!member) {
    throw new Error('MEMBER_NOT_FOUND')
  }

  const updated = await prisma.member.update({
    where: { id: input.memberId },
    data: { calendarColor: input.color },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })

  return {
    memberId: updated.id,
    name: updated.user.name ?? 'Unknown',
    email: updated.user.email,
    color: updated.calendarColor ?? null,
  }
}
