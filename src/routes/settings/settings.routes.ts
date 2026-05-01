/**
 * Company Settings API (§13.1 Profile & Company Settings).
 * GET/PATCH current business profile + settings (Reply list, Due dates, Company details,
 * Bank details, Terms, Arrival window, WhatsApp, Tax).
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const PersonalProfileSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string(),
})

const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  webpage: z.string().nullable(),
  address: z.string().nullable(),
  street1: z.string().nullable(),
  street2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipcode: z.string().nullable(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  rutNumber: z.string().nullable(),
})

const SettingsBlockSchema = z.object({
  replyToEmail: z.string().nullable(),
  quoteExpirationDays: z.number().int(),
  invoiceDueDays: z.number().int(),
  arrivalWindowHours: z.number().int().nullable(),
  arrivalWindowMinutes: z.number().int().nullable(),
  defaultDurationMinutes: z.number().int().nullable(),
  bankName: z.string().nullable(),
  accountType: z.string().nullable(),
  accountNumber: z.string().nullable(),
  paymentEmail: z.string().nullable(),
  onlinePaymentLink: z.string().nullable(),
  quoteTermsConditions: z.string().nullable(),
  invoiceTermsConditions: z.string().nullable(),
  whatsappSender: z.string().nullable(),
  defaultTaxRate: z.number().nullable(),
  taxIdRut: z.string().nullable(),
  sendTeamPhotosWithConfirmation: z.boolean(),
  timeZone: z.string().nullable(),
})

const CurrentSettingsResponseSchema = z.object({
  personalProfile: PersonalProfileSchema,
  company: CompanySchema,
  settings: SettingsBlockSchema,
})

const ScheduleColorAssigneeSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  email: z.string().email(),
  color: z.string().nullable(),
})

const DispatchBookingConfirmationRemindersBodySchema = z.object({
  asOf: z.coerce.date().optional(),
  dryRun: z.boolean().optional().default(false),
})

const BookingReminderScheduleSchema = z.object({
  id: z.string(),
  timeValue: z.number().int().min(1),
  timeUnit: z.enum(['hours', 'days']),
  timeOfDay: z.string().nullable(),
  channel: z.literal('EMAIL'),
  isEnabled: z.boolean(),
})

const BookingReminderTemplateSchema = z.object({
  subject: z.string(),
  message: z.string(),
})

const BookingConfirmationReminderSettingsSchema = z.object({
  enabled: z.boolean(),
  schedules: z.array(BookingReminderScheduleSchema),
  template: BookingReminderTemplateSchema,
})

const UpdateBookingReminderScheduleSchema = z.object({
  id: z.string().optional(),
  timeValue: z.number().int().min(1),
  timeUnit: z.enum(['hours', 'days']),
  timeOfDay: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
})

const UpdateBookingConfirmationReminderSettingsBodySchema = z.object({
  enabled: z.boolean().optional(),
  schedules: z.array(UpdateBookingReminderScheduleSchema).optional(),
  template: BookingReminderTemplateSchema.partial().optional(),
})

const DispatchBookingConfirmationRemindersResponseSchema = z.object({
  asOf: z.coerce.date(),
  dryRun: z.boolean(),
  processed: z.number().int(),
  sent: z.number().int(),
  skipped: z.number().int(),
  skippedReasons: z.object({
    bookingReminderDisabled: z.number().int(),
    noReminderConfigs: z.number().int(),
    noClientEmail: z.number().int(),
    alreadySentForSchedule: z.number().int(),
    notDueYet: z.number().int(),
    missedWindow: z.number().int(),
  }),
})

const UpdateSettingsBodySchema = z
  .object({
    fullName: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    legalName: z.string().nullable().optional(),
    companyEmail: z.string().email().optional(),
    phone: z.string().nullable().optional(),
    webpage: z.string().url().nullable().or(z.literal('')).optional(),
    address: z.string().nullable().optional(),
    street1: z.string().nullable().optional(),
    street2: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    zipcode: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    primaryColor: z.string().nullable().optional(),
    secondaryColor: z.string().nullable().optional(),
    rutNumber: z.string().nullable().optional(),
    replyToEmail: z.string().email().nullable().or(z.literal('')).optional(),
    quoteExpirationDays: z.number().int().min(1).optional(),
    invoiceDueDays: z.number().int().min(1).optional(),
    arrivalWindowHours: z.number().int().min(1).max(4).nullable().optional(),
    bankName: z.string().nullable().optional(),
    accountType: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    paymentEmail: z.string().email().nullable().or(z.literal('')).optional(),
    onlinePaymentLink: z.string().url().nullable().or(z.literal('')).optional(),
    quoteTermsConditions: z.string().nullable().optional(),
    invoiceTermsConditions: z.string().nullable().optional(),
    settings: z
      .object({
        quoteTermsConditions: z.string().nullable().optional(),
        invoiceTermsConditions: z.string().nullable().optional(),
      })
      .optional(),
    data: z
      .object({
        settings: z
          .object({
            quoteTermsConditions: z.string().nullable().optional(),
            invoiceTermsConditions: z.string().nullable().optional(),
          })
          .optional(),
      })
      .optional(),
    whatsappSender: z.string().nullable().optional(),
    defaultTaxRate: z.number().min(0).max(100).nullable().optional(),
    taxIdRut: z.string().nullable().optional(),
    sendTeamPhotosWithConfirmation: z.boolean().optional(),
    timeZone: z.string().nullable().optional(),
  })
  .openapi({ description: 'Update any subset of profile and company settings' })

export const SETTINGS_ROUTES = {
  get: createRoute({
    method: 'get',
    tags: ['Settings'],
    path: '/',
    summary: 'Get current business settings (profile + company + settings)',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(CurrentSettingsResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Settings'],
    path: '/',
    summary: 'Update current business profile and/or company settings',
    request: { body: jsonContentRequired(UpdateSettingsBodySchema, 'Update payload') },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(CurrentSettingsResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getScheduleColors: createRoute({
    method: 'get',
    tags: ['Settings'],
    path: '/schedule/colors',
    summary: 'Get schedule settings calendar colors by team member',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.array(ScheduleColorAssigneeSchema)),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  updateScheduleColor: createRoute({
    method: 'patch',
    tags: ['Settings'],
    path: '/schedule/colors/{memberId}',
    summary: 'Assign calendar color to team member',
    request: {
      params: z.object({
        memberId: z.string().openapi({ param: { name: 'memberId', in: 'path' } }),
      }),
      body: jsonContentRequired(
        z.object({
          color: z
            .string()
            .regex(/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/, 'Color must be HEX (#RRGGBB or #RGB)')
            .nullable(),
        }),
        'Color payload'
      ),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ScheduleColorAssigneeSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or member not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  deleteScheduleColor: createRoute({
    method: 'delete',
    tags: ['Settings'],
    path: '/schedule/colors/{memberId}',
    summary: 'Delete assigned calendar color from team member',
    request: {
      params: z.object({
        memberId: z.string().openapi({ param: { name: 'memberId', in: 'path' } }),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ScheduleColorAssigneeSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or member not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getBookingConfirmationReminderSettings: createRoute({
    method: 'get',
    tags: ['Settings'],
    path: '/booking-confirmation-reminders',
    summary: 'Get booking confirmation reminder schedules and email template (email only)',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(BookingConfirmationReminderSettingsSchema),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  updateBookingConfirmationReminderSettings: createRoute({
    method: 'patch',
    tags: ['Settings'],
    path: '/booking-confirmation-reminders',
    summary: 'Update booking confirmation reminder schedules and email template (email only)',
    request: {
      body: jsonContentRequired(
        UpdateBookingConfirmationReminderSettingsBodySchema,
        'Booking confirmation reminder settings payload'
      ),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(BookingConfirmationReminderSettingsSchema),
        'Updated'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  dispatchBookingConfirmationReminders: createRoute({
    method: 'post',
    tags: ['Settings'],
    path: '/booking-confirmation-reminders/dispatch',
    summary:
      'Dispatch due booking confirmation reminder emails from business settings to workorder clients',
    request: {
      body: jsonContentRequired(
        DispatchBookingConfirmationRemindersBodySchema,
        'Optional dispatch controls'
      ),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(DispatchBookingConfirmationRemindersResponseSchema),
        'Dispatch completed'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type SettingsRoutes = typeof SETTINGS_ROUTES
