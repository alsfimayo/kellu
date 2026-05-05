import { TemplateType } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

export type EmailTemplatePayload = { subject: string; message: string }

async function ensureBusinessSettingsId(businessId: string): Promise<string> {
  const settings = await prisma.businessSettings.upsert({
    where: { businessId },
    create: { businessId },
    update: {},
    select: { id: true },
  })
  return settings.id
}

export async function getSendQuoteEmailTemplate(businessId: string): Promise<EmailTemplatePayload> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  const settingsId = await ensureBusinessSettingsId(businessId)

  const row = await prisma.messageTemplate.findFirst({
    where: { settingsId, templateType: TemplateType.QUOTE, channel: 'EMAIL' },
    orderBy: { updatedAt: 'desc' },
    select: { subject: true, message: true },
  })

  return {
    subject: row?.subject?.trim() || 'Following up on quote {quote_number}',
    message:
      row?.message?.trim() ||
      `Hi {client_name},\n\nWe just wanted to send a quick note to see if you had a chance to look at the quote we sent recently? We're happy to answer any questions you might have.\n\nWe're excited to get to work, so if you'd like to proceed let us know and we can get started!\n\nThanks,`,
  }
}

export async function updateSendQuoteEmailTemplate(
  businessId: string,
  input: EmailTemplatePayload
): Promise<EmailTemplatePayload> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  const settingsId = await ensureBusinessSettingsId(businessId)

  const existing = await prisma.messageTemplate.findFirst({
    where: { settingsId, templateType: TemplateType.QUOTE, channel: 'EMAIL' },
    select: { id: true },
  })

  if (existing) {
    await prisma.messageTemplate.update({
      where: { id: existing.id },
      data: {
        subject: input.subject,
        message: input.message,
        isDefault: false,
      },
    })
  } else {
    await prisma.messageTemplate.create({
      data: {
        settingsId,
        templateType: TemplateType.QUOTE,
        channel: 'EMAIL',
        subject: input.subject,
        message: input.message,
        isDefault: false,
      },
    })
  }

  return getSendQuoteEmailTemplate(businessId)
}

