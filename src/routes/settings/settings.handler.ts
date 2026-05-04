/**
 * Settings API handlers – current business profile + company settings (§13.1).
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { SETTINGS_ROUTES } from '~/routes/settings/settings.routes'
import { createAuditLog } from '~/services/audit-log.service'
import {
  dispatchBookingConfirmationReminders,
  getBookingConfirmationReminderSettings,
  getBookingReminderTemplateVariablesResponse,
  updateBookingConfirmationReminderSettings,
} from '~/services/booking-confirmation-reminders.service'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import { hasPermission } from '~/services/permission.service'
import {
  getCurrentBusinessSettings,
  listScheduleColors,
  updateCurrentBusinessSettings,
  updateScheduleColor,
} from '~/services/settings.service'
import type { HandlerMapFromRoutes } from '~/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

// ─── Split into two functions to keep each under complexity limit ─────────────

type SettingsBody = Record<string, unknown> & {
  quoteTermsConditions?: string
  invoiceTermsConditions?: string
  settings?: { quoteTermsConditions?: string; invoiceTermsConditions?: string }
  data?: { settings?: { quoteTermsConditions?: string; invoiceTermsConditions?: string } }
}

/** Maps profile + company fields from request body */
function mapProfileAndCompanyFields(body: SettingsBody) {
  const data: Record<string, unknown> = {}

  if (body.fullName !== undefined) {
    data.fullName = body.fullName
  }
  if (body.email !== undefined) {
    data.email = body.email
  }
  if (body.name !== undefined) {
    data.name = body.name
  }
  if (body.legalName !== undefined) {
    data.legalName = body.legalName
  }
  if (body.companyEmail !== undefined) {
    data.companyEmail = body.companyEmail
  }
  if (body.phone !== undefined) {
    data.phone = body.phone
  }
  if (body.webpage !== undefined) {
    data.webpage = body.webpage || null
  }
  if (body.address !== undefined) {
    data.address = body.address
  }
  if (body.street1 !== undefined) {
    data.street1 = body.street1
  }
  if (body.street2 !== undefined) {
    data.street2 = body.street2
  }
  if (body.city !== undefined) {
    data.city = body.city
  }
  if (body.state !== undefined) {
    data.state = body.state
  }
  if (body.zipcode !== undefined) {
    data.zipcode = body.zipcode
  }
  if (body.logoUrl !== undefined) {
    data.logoUrl = body.logoUrl
  }
  if (body.primaryColor !== undefined) {
    data.primaryColor = body.primaryColor
  }
  if (body.secondaryColor !== undefined) {
    data.secondaryColor = body.secondaryColor
  }
  if (body.rutNumber !== undefined) {
    data.rutNumber = body.rutNumber
  }
  if (body.timeZone !== undefined) {
    data.timeZone = body.timeZone
  }

  return data
}

/** Maps billing + settings fields from request body */
function mapBillingAndSettingsFields(body: SettingsBody) {
  const data: Record<string, unknown> = {}

  const quoteTermsConditions =
    body.quoteTermsConditions ??
    body.settings?.quoteTermsConditions ??
    body.data?.settings?.quoteTermsConditions

  const invoiceTermsConditions =
    body.invoiceTermsConditions ??
    body.settings?.invoiceTermsConditions ??
    body.data?.settings?.invoiceTermsConditions

  if (body.replyToEmail !== undefined) {
    data.replyToEmail = body.replyToEmail || null
  }
  if (body.quoteExpirationDays !== undefined) {
    data.quoteExpirationDays = body.quoteExpirationDays
  }
  if (body.invoiceDueDays !== undefined) {
    data.invoiceDueDays = body.invoiceDueDays
  }
  if (body.arrivalWindowHours !== undefined) {
    data.arrivalWindowHours = body.arrivalWindowHours
  }
  if (body.bankName !== undefined) {
    data.bankName = body.bankName
  }
  if (body.accountType !== undefined) {
    data.accountType = body.accountType
  }
  if (body.accountNumber !== undefined) {
    data.accountNumber = body.accountNumber
  }
  if (body.paymentEmail !== undefined) {
    data.paymentEmail = body.paymentEmail || null
  }
  if (body.onlinePaymentLink !== undefined) {
    data.onlinePaymentLink = body.onlinePaymentLink || null
  }
  if (body.whatsappSender !== undefined) {
    data.whatsappSender = body.whatsappSender
  }
  if (body.defaultTaxRate !== undefined) {
    data.defaultTaxRate = body.defaultTaxRate
  }
  if (body.taxIdRut !== undefined) {
    data.taxIdRut = body.taxIdRut
  }
  if (body.sendTeamPhotosWithConfirmation !== undefined) {
    data.sendTeamPhotosWithConfirmation = body.sendTeamPhotosWithConfirmation
  }
  if (quoteTermsConditions !== undefined) {
    data.quoteTermsConditions = quoteTermsConditions
  }
  if (invoiceTermsConditions !== undefined) {
    data.invoiceTermsConditions = invoiceTermsConditions
  }

  return data
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const SETTINGS_HANDLER: HandlerMapFromRoutes<typeof SETTINGS_ROUTES> = {
  get: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const data = await getCurrentBusinessSettings(businessId)
      return c.json(
        { message: 'Settings retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching settings:', error)
      return c.json(
        { message: 'Failed to retrieve settings' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  // ✅ Complexity is now low — all mapping is extracted into helpers above
  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const body = c.req.valid('json') as SettingsBody

      // ✅ All field mapping is now in two small helper functions
      const input = {
        ...mapProfileAndCompanyFields(body),
        ...mapBillingAndSettingsFields(body),
      }

      const data = await updateCurrentBusinessSettings(businessId, input)

      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'SETTINGS_UPDATED',
        module: 'settings',
        entityId: businessId,
        newValues: {
          fullName: data.personalProfile.fullName,
          email: data.personalProfile.email,
          name: data.company.name,
          legalName: data.company.legalName,
          companyEmail: data.company.email,
          phone: data.company.phone,
          webpage: data.company.webpage,
          address: data.company.address,
          street1: data.company.street1,
          street2: data.company.street2,
          city: data.company.city,
        },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Settings updated successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating settings:', error)
      return c.json({ message: 'Failed to update settings' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  getScheduleColors: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const data = await listScheduleColors(businessId)
      return c.json(
        { message: 'Schedule colors retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching schedule colors:', error)
      return c.json(
        { message: 'Failed to retrieve schedule colors' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  updateScheduleColor: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { memberId } = c.req.valid('param')
      const { color } = c.req.valid('json')

      const data = await updateScheduleColor(businessId, { memberId, color })

      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'SETTINGS_UPDATED',
        module: 'settings',
        entityId: memberId,
        newValues: { scheduleColor: color },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Schedule color updated successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'MEMBER_NOT_FOUND') {
        return c.json({ message: 'Team member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating schedule color:', error)
      return c.json(
        { message: 'Failed to update schedule color' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  deleteScheduleColor: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { memberId } = c.req.valid('param')
      const data = await updateScheduleColor(businessId, { memberId, color: null })

      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'SETTINGS_UPDATED',
        module: 'settings',
        entityId: memberId,
        newValues: { scheduleColor: null },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Schedule color deleted successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'MEMBER_NOT_FOUND') {
        return c.json({ message: 'Team member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting schedule color:', error)
      return c.json(
        { message: 'Failed to delete schedule color' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getBookingConfirmationReminders: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }
      const data = await getBookingConfirmationReminderSettings(businessId)
      return c.json(
        { message: 'Booking confirmation reminders retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching booking confirmation reminders:', error)
      return c.json(
        { message: 'Failed to retrieve booking confirmation reminders' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  patchBookingConfirmationReminders: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }
      const body = c.req.valid('json')
      const data = await updateBookingConfirmationReminderSettings(businessId, {
        enabled: body.enabled,
        schedules: body.schedules,
        template: body.template,
      })
      return c.json(
        { message: 'Booking confirmation reminders updated successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating booking confirmation reminders:', error)
      return c.json(
        { message: 'Failed to update booking confirmation reminders' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  postBookingConfirmationRemindersDispatch: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }
      const body = c.req.valid('json')
      const asOf = body.asOf ? new Date(body.asOf) : undefined
      const dryRun = body.dryRun ?? false
      const data = await dispatchBookingConfirmationReminders(businessId, { asOf, dryRun })
      return c.json(
        { message: 'Booking confirmation reminders dispatched successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error dispatching booking confirmation reminders:', error)
      return c.json(
        { message: 'Failed to dispatch booking confirmation reminders' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getBookingConfirmationReminderTemplateVariables: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'settings', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }
      const data = getBookingReminderTemplateVariablesResponse()
      return c.json(
        {
          message: 'Booking reminder template variables retrieved successfully',
          success: true,
          data,
        },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching booking reminder template variables:', error)
      return c.json(
        { message: 'Failed to retrieve booking reminder template variables' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
