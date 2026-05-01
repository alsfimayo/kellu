import type { ClientStatus, LeadSource, Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'
import { sendCustomerReminderEmail } from '~/services/email-helpers'

export class ClientNotFoundError extends Error {
  constructor() {
    super('CLIENT_NOT_FOUND')
  }
}

export class ClientEmailRequiredError extends Error {
  constructor() {
    super('CLIENT_EMAIL_REQUIRED')
  }
}
export class ClientReminderNotFoundError extends Error {
  constructor() {
    super('CLIENT_REMINDER_NOT_FOUND')
  }
}

export interface CreateClientInput {
  name: string
  phone: string
  email?: string | null
  documentNumber?: string | null
  leadSource?: LeadSource
  notes?: string | null
}

export interface UpdateClientInput {
  name?: string
  phone?: string
  email?: string | null
  documentNumber?: string | null
  leadSource?: LeadSource
  notes?: string | null
  status?: ClientStatus
}

export interface ClientListFilters {
  search?: string
  status?: ClientStatus
  sortBy?: 'name' | 'lastActivityAt' | 'createdAt'
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface ClientListItem {
  id: string
  businessId: string
  name: string
  status: string
  lastActivity: string | null
}

export interface ClientStatistics {
  newClientsLast30Days: number
  totalNewClientsYTD: number
}

export type ClientMessageStatus = 'SEND_OFFER' | 'MAINTENANCE_FOLLOW_UP'

export interface ClientMessageTemplateResult {
  status: ClientMessageStatus
  to: string | null
  subjectTemplate: string
  messageTemplate: string
  subjectPreview: string
  messagePreview: string
  variables?: Record<string, string>
}
export interface BulkClientMessageRecipientInput {
  clientId: string
  subjectTemplate?: string
  messageTemplate?: string
}
export interface BulkClientMessageResult {
  total: number
  sent: number
  failed: number
  results: Array<{
    clientId: string
    success: boolean
    data?: ClientMessageTemplateResult
    error?: string
  }>
}

interface ClientMessageTemplateVariables {
  clientName: string
  companyName: string
  companyInfo: string
  defaultEmail: string
  contactEmail: string
  phoneNumber: string
  lineItems: string
  discountAmount: string
  total: string
  paymentAmount: string
  balance: string
  quoteNumber: string
  quoteSentDate: string
  workorderNumber: string
  arrivalWindow: string
  jobDate: string
  jobDateTime: string
  jobAddress: string
  jobTitle: string
  invoiceNumber: string
  invoiceSentDate: string
  dueDate: string
  currentDate: string
}

export interface ClientDetail {
  id: string
  businessId: string
  name: string
  phone: string
  email: string | null
  address: string | null
  documentNumber: string | null
  leadSource: string
  notes: string | null
  status: string
  lastActivityAt: Date | null
  lastActivity: string | null
  createdAt: Date
  updatedAt: Date
}

function formatLastActivity(d: Date | null): string | null {
  if (!d) {
    return null
  }
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) {
    return 'Just now'
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)} minutes ago`
  }
  if (sec < 86400) {
    return `${Math.floor(sec / 3600)} hours ago`
  }
  if (sec < 604800) {
    return `${Math.floor(sec / 86400)} days ago`
  }
  if (sec < 2592000) {
    return `${Math.floor(sec / 86400)} days ago`
  }
  if (sec < 31536000) {
    return `${Math.floor(sec / 2592000)} months ago`
  }
  return `${Math.floor(sec / 31536000)} years ago`
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }
}

export async function createClient(businessId: string, data: CreateClientInput) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.create({
    data: {
      businessId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      documentNumber: data.documentNumber ?? null,
      leadSource: data.leadSource ?? 'Website',
      notes: data.notes ?? null,
      lastActivityAt: new Date(),
    },
  })

  return mapToClientDetail(client)
}

export async function getClients(businessId: string, filters: ClientListFilters = {}) {
  await ensureBusinessExists(businessId)

  const { search, status, sortBy = 'createdAt', order = 'desc', page = 1, limit = 10 } = filters

  const skip = (page - 1) * limit

  const searchWhere = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const statusWhere = status ? { status } : {}
  const where = { businessId, ...searchWhere, ...statusWhere }

  const orderByField =
    sortBy === 'lastActivityAt' ? 'lastActivityAt' : sortBy === 'name' ? 'name' : 'createdAt'
  const orderBy = { [orderByField]: order }

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.client.count({ where }),
  ])

  const data: ClientListItem[] = clients.map(c => ({
    id: c.id,
    businessId: c.businessId,
    name: c.name,
    status: c.status,
    lastActivity: formatLastActivity(c.lastActivityAt ?? c.updatedAt),
  }))

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export async function getClientStatistics(businessId: string): Promise<ClientStatistics> {
  await ensureBusinessExists(businessId)

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const [newClientsLast30Days, totalNewClientsYTD] = await Promise.all([
    prisma.client.count({
      where: {
        businessId,
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.client.count({
      where: {
        businessId,
        createdAt: { gte: startOfYear },
      },
    }),
  ])

  return {
    newClientsLast30Days,
    totalNewClientsYTD,
  }
}

function mapToClientDetail(client: {
  id: string
  businessId: string
  name: string
  phone: string
  email: string | null
  address: string | null
  documentNumber: string | null
  leadSource: string
  notes: string | null
  status: string
  lastActivityAt: Date | null
  createdAt: Date
  updatedAt: Date
}): ClientDetail {
  return {
    id: client.id,
    businessId: client.businessId,
    name: client.name,
    phone: client.phone,
    email: client.email,
    address: client.address,
    documentNumber: client.documentNumber,
    leadSource: client.leadSource,
    notes: client.notes,
    status: client.status,
    lastActivityAt: client.lastActivityAt,
    lastActivity: formatLastActivity(client.lastActivityAt ?? client.updatedAt),
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  }
}

export async function getClientById(businessId: string, clientId: string) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })

  if (!client) {
    throw new ClientNotFoundError()
  }
  return mapToClientDetail(client)
}

/** Get client by ID only (no business scope – use for GET /clients/:clientId) */
export async function getClientByClientId(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }
  return mapToClientDetail(client)
}

export async function updateClient(businessId: string, clientId: string, data: UpdateClientInput) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })
  if (!existing) {
    throw new ClientNotFoundError()
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.phone != null && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.documentNumber !== undefined && { documentNumber: data.documentNumber }),
      ...(data.leadSource != null && { leadSource: data.leadSource }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status != null && { status: data.status }),
    },
  })

  return mapToClientDetail(client)
}

/** Update client by ID only (no business in path – use for PATCH /clients/:clientId) */
export async function updateClientByClientId(clientId: string, data: UpdateClientInput) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!existing) {
    throw new ClientNotFoundError()
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.phone != null && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.documentNumber !== undefined && { documentNumber: data.documentNumber }),
      ...(data.leadSource != null && { leadSource: data.leadSource }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status != null && { status: data.status }),
    },
  })

  return mapToClientDetail(client)
}

export async function deleteClient(businessId: string, clientId: string) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })
  if (!existing) {
    throw new ClientNotFoundError()
  }

  await prisma.client.delete({
    where: { id: clientId },
  })
}

/** Delete client by ID only (no business in path – use for DELETE /clients/:clientId) */
export async function deleteClientByClientId(clientId: string) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!existing) {
    throw new ClientNotFoundError()
  }
  await prisma.client.delete({
    where: { id: clientId },
  })
}

export function getLeadSources(): { value: string; label: string }[] {
  return [
    { value: 'Website', label: 'Website' },
    { value: 'SocialMedia', label: 'Social Media' },
    { value: 'Referral', label: 'Referral' },
    { value: 'Other', label: 'Other' },
  ]
}

function formatCurrentDateForTemplate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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
  return formatCurrentDateForTemplate(value)
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

async function buildClientTemplateVariables(clientId: string): Promise<{
  client: {
    id: string
    name: string
    email: string | null
    businessId: string
    business: {
      name: string
      email: string
      phone: string | null
      settings: { replyToEmail: string | null } | null
    }
  }
  variables: ClientMessageTemplateVariables
}> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      email: true,
      businessId: true,
      business: {
        select: {
          name: true,
          email: true,
          phone: true,
          settings: { select: { replyToEmail: true } },
        },
      },
      workOrders: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          workOrderNumber: true,
          scheduledAt: true,
          startTime: true,
          endTime: true,
          address: true,
          title: true,
          discount: true,
          total: true,
          amountPaid: true,
          balance: true,
          lineItems: { select: { name: true, quantity: true } },
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
  if (!client) {
    throw new ClientNotFoundError()
  }

  const latestWorkorder = client.workOrders[0] ?? null
  const latestQuote = client.quotes[0] ?? null
  const latestInvoice = client.invoices[0] ?? null
  const lineItems =
    joinLineItemsForTemplate(latestWorkorder?.lineItems) ||
    joinLineItemsForTemplate(latestQuote?.lineItems) ||
    joinLineItemsForTemplate(latestInvoice?.lineItems) ||
    ''

  const preferredEmail = client.business.settings?.replyToEmail?.trim() || client.business.email
  const variables: ClientMessageTemplateVariables = {
    clientName: client.name,
    companyName: client.business.name,
    companyInfo: client.business.name,
    defaultEmail: preferredEmail,
    contactEmail: preferredEmail,
    phoneNumber: client.business.phone?.trim() || '',
    lineItems,
    discountAmount: formatMoneyForTemplate(
      latestWorkorder?.discount ?? latestQuote?.discount ?? latestInvoice?.discount ?? 0
    ),
    total: formatMoneyForTemplate(
      latestWorkorder?.total ?? latestQuote?.total ?? latestInvoice?.total ?? 0
    ),
    paymentAmount: formatMoneyForTemplate(
      latestWorkorder?.amountPaid ?? latestQuote?.amountPaid ?? latestInvoice?.amountPaid ?? 0
    ),
    balance: formatMoneyForTemplate(
      latestWorkorder?.balance ?? latestQuote?.balance ?? latestInvoice?.balance ?? 0
    ),
    quoteNumber: latestQuote?.quoteNumber ?? '',
    quoteSentDate: formatDateForTemplate(latestQuote?.quoteSentAt),
    workorderNumber: latestWorkorder?.workOrderNumber ?? '',
    arrivalWindow:
      latestWorkorder?.startTime && latestWorkorder?.endTime
        ? `${latestWorkorder.startTime} - ${latestWorkorder.endTime}`
        : (latestWorkorder?.startTime ?? ''),
    jobDate: formatDateForTemplate(latestWorkorder?.scheduledAt),
    jobDateTime: formatDateTimeForTemplate(
      latestWorkorder?.scheduledAt,
      latestWorkorder?.startTime
    ),
    jobAddress: latestWorkorder?.address ?? '',
    jobTitle: latestWorkorder?.title ?? '',
    invoiceNumber: latestInvoice?.invoiceNumber ?? '',
    invoiceSentDate: formatDateForTemplate(latestInvoice?.sentAt),
    dueDate: formatDateForTemplate(latestInvoice?.dueAt),
    currentDate: formatCurrentDateForTemplate(new Date()),
  }

  return {
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      businessId: client.businessId,
      business: client.business,
    },
    variables,
  }
}

function buildTemplateContent(status: ClientMessageStatus): {
  subjectTemplate: string
  messageTemplate: string
} {
  if (status === 'SEND_OFFER') {
    return {
      subjectTemplate: 'Special offer from {{COMPANY_NAME}} - {{CURRENT_DATE}}',
      messageTemplate: [
        'Hi {{CLIENT_NAME}},',
        '',
        'We have a special offer for you.',
        '',
        'Get in touch with us at {{DEFAULT_EMAIL}} to learn more.',
        '',
        'Sincerely,',
        '{{COMPANY_NAME}}',
      ].join('\n'),
    }
  }

  return {
    subjectTemplate: 'Maintenance follow-up from {{COMPANY_NAME}}',
    messageTemplate: [
      'Hi {{CLIENT_NAME}},',
      '',
      'This is a friendly reminder about your scheduled maintenance.',
      '',
      'If you have any questions, contact us at {{DEFAULT_EMAIL}}.',
      '',
      'Best regards,',
      '{{COMPANY_NAME}}',
    ].join('\n'),
  }
}

function applyClientTemplateVariables(input: string, data: ClientMessageTemplateVariables): string {
  const singleBraceMap: Record<string, string> = {
    current_date: data.currentDate,
    client_name: data.clientName,
    company_info: data.companyInfo,
    company_name: data.companyName,
    contact_email: data.contactEmail,
    phone_number: data.phoneNumber,
    line_items: data.lineItems,
    discount_amount: data.discountAmount,
    total: data.total,
    payment_amount: data.paymentAmount,
    balance: data.balance,
    quote_number: data.quoteNumber,
    quote_sent_date: data.quoteSentDate,
    workorder_number: data.workorderNumber,
    arrival_window: data.arrivalWindow,
    job_date: data.jobDate,
    job_date_time: data.jobDateTime,
    job_address: data.jobAddress,
    job_title: data.jobTitle,
    invoice_number: data.invoiceNumber,
    invoice_sent_date: data.invoiceSentDate,
    due_date: data.dueDate,
  }
  const doubleBraceMap: Record<string, string> = {
    CLIENT_NAME: data.clientName,
    COMPANY_NAME: data.companyName,
    DEFAULT_EMAIL: data.defaultEmail,
    CURRENT_DATE: data.currentDate,
  }

  let out = input
  for (const [token, value] of Object.entries(singleBraceMap)) {
    out = out.split(`{${token}}`).join(value)
  }
  for (const [token, value] of Object.entries(doubleBraceMap)) {
    out = out.split(`{{${token}}}`).join(value)
  }
  return out
}

function toHtmlFromPlainText(text: string): string {
  return text
    .split('\n')
    .map(line => (line.length > 0 ? `<p>${line}</p>` : '<br/>'))
    .join('')
}

function buildClientMessageTemplateResult(
  status: ClientMessageStatus,
  to: string | null,
  variables: ClientMessageTemplateVariables,
  overrides?: { subjectTemplate?: string; messageTemplate?: string }
): ClientMessageTemplateResult {
  const defaults = buildTemplateContent(status)
  const subjectTemplate = overrides?.subjectTemplate ?? defaults.subjectTemplate
  const messageTemplate = overrides?.messageTemplate ?? defaults.messageTemplate
  return {
    status,
    to,
    subjectTemplate,
    messageTemplate,
    subjectPreview: applyClientTemplateVariables(subjectTemplate, variables),
    messagePreview: applyClientTemplateVariables(messageTemplate, variables),
    variables: {
      current_date: variables.currentDate,
      client_name: variables.clientName,
      company_info: variables.companyInfo,
      company_name: variables.companyName,
      contact_email: variables.contactEmail,
      phone_number: variables.phoneNumber,
      line_items: variables.lineItems,
      discount_amount: variables.discountAmount,
      total: variables.total,
      payment_amount: variables.paymentAmount,
      balance: variables.balance,
      quote_number: variables.quoteNumber,
      quote_sent_date: variables.quoteSentDate,
      workorder_number: variables.workorderNumber,
      arrival_window: variables.arrivalWindow,
      job_date: variables.jobDate,
      job_date_time: variables.jobDateTime,
      job_address: variables.jobAddress,
      job_title: variables.jobTitle,
      invoice_number: variables.invoiceNumber,
      invoice_sent_date: variables.invoiceSentDate,
      due_date: variables.dueDate,
    },
  }
}

export async function getLatestClientMessageTemplate(
  clientId: string,
  status: ClientMessageStatus
): Promise<ClientMessageTemplateResult> {
  const { client, variables } = await buildClientTemplateVariables(clientId)

  const latestLog = await prisma.auditLog.findFirst({
    where: {
      businessId: client.businessId,
      entityType: 'CLIENT_MESSAGE',
      entityId: client.id,
      action: `CLIENT_MESSAGE_SENT_${status}`,
    },
    orderBy: { createdAt: 'desc' },
    select: { newValues: true },
  })

  const logRecord = latestLog?.newValues as {
    status?: ClientMessageStatus
    to?: string | null
    subjectTemplate?: string
    messageTemplate?: string
    subjectPreview?: string
    messagePreview?: string
  } | null

  if (
    logRecord?.status === status &&
    typeof logRecord.subjectTemplate === 'string' &&
    typeof logRecord.messageTemplate === 'string'
  ) {
    return buildClientMessageTemplateResult(status, logRecord.to ?? client.email, variables, {
      subjectTemplate: logRecord.subjectTemplate,
      messageTemplate: logRecord.messageTemplate,
    })
  }
  return buildClientMessageTemplateResult(status, client.email, variables)
}

export async function getClientMessageTemplate(
  clientId: string,
  status: ClientMessageStatus,
  senderUserId?: string
): Promise<ClientMessageTemplateResult> {
  const { client, variables } = await buildClientTemplateVariables(clientId)
  if (!client.email) {
    throw new ClientEmailRequiredError()
  }
  const messageData = buildClientMessageTemplateResult(status, client.email, variables)
  await sendClientTemplateMessage({
    client: { ...client, email: client.email },
    status,
    senderUserId,
    messageData,
  })

  return messageData
}

async function sendClientTemplateMessage(input: {
  client: {
    id: string
    name: string
    email: string
    businessId: string
    business: { name: string; email: string }
  }
  status: ClientMessageStatus
  senderUserId?: string
  messageData: ClientMessageTemplateResult
}) {
  const { client, status, senderUserId, messageData } = input
  await emailService.send({
    to: client.email,
    subject: messageData.subjectPreview,
    html: toHtmlFromPlainText(messageData.messagePreview),
    from: `${client.business.name} <${process.env.RESEND_FROM_EMAIL ?? 'noresponder@notificaciones.kellu.co'}>`,
    replyTo: client.business.email,
  })

  await prisma.auditLog.create({
    data: {
      action: `CLIENT_MESSAGE_SENT_${status}`,
      entityType: 'CLIENT_MESSAGE',
      entityId: client.id,
      businessId: client.businessId,
      userId: senderUserId,
      newValues: messageData as unknown as Prisma.InputJsonValue,
    },
  })
}

export async function sendClientMessageTemplateBulk(
  status: ClientMessageStatus,
  recipients: BulkClientMessageRecipientInput[],
  senderUserId?: string
): Promise<BulkClientMessageResult> {
  const results: BulkClientMessageResult['results'] = []
  for (const recipient of recipients) {
    try {
      const { client, variables } = await buildClientTemplateVariables(recipient.clientId)
      if (!client.email) {
        throw new ClientEmailRequiredError()
      }
      const messageData = buildClientMessageTemplateResult(status, client.email, variables, {
        subjectTemplate: recipient.subjectTemplate,
        messageTemplate: recipient.messageTemplate,
      })
      await sendClientTemplateMessage({
        client: { ...client, email: client.email },
        status,
        senderUserId,
        messageData,
      })
      results.push({
        clientId: recipient.clientId,
        success: true,
        data: messageData,
      })
    } catch (error) {
      const errorMessage =
        error instanceof ClientNotFoundError
          ? 'Client not found'
          : error instanceof ClientEmailRequiredError
            ? 'Client email is required to send this message'
            : 'Failed to send client message'
      results.push({
        clientId: recipient.clientId,
        success: false,
        error: errorMessage,
      })
    }
  }

  const sent = results.filter(item => item.success).length
  const failed = results.length - sent
  return {
    total: results.length,
    sent,
    failed,
    results,
  }
}

export async function listClientCustomerReminders(businessId: string, clientId: string) {
  await ensureBusinessExists(businessId)
  await triggerDueClientRemindersForBusiness(businessId)

  const clientRecord = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true, reminderDate: true, reminderNote: true },
  })
  if (!clientRecord) {
    throw new ClientNotFoundError()
  }

  const reminderLogs = await prisma.reminderLog.findMany({
    where: { businessId, clientId: clientRecord.id, reminderType: 'CLIENT_FOLLOW_UP' },
    orderBy: { sentAt: 'desc' },
  })

  const isValidReminderDate = (date: Date): boolean => {
    const year = date.getUTCFullYear()
    return year >= 2000 && year <= 2100
  }
  const toReminderDto = (item: {
    id: string
    sentAt: Date
    note: string | null
    createdAt: Date
  }) => ({
    id: item.id,
    dateTime: item.sentAt,
    note: item.note ?? null,
    createdAt: item.createdAt,
  })
  const isTriggeredReminder = (item: { sentAt: Date; createdAt: Date }) =>
    item.createdAt.getTime() >= item.sentAt.getTime()

  const validReminderLogs = reminderLogs.filter(item => isValidReminderDate(item.sentAt))
  const uniqueByDateTime = <T extends { sentAt: Date; createdAt: Date }>(
    logs: T[],
    keep: 'earliest' | 'latest'
  ): T[] => {
    const map = new Map<number, T>()
    for (const item of logs) {
      const key = item.sentAt.getTime()
      const prev = map.get(key)
      if (!prev) {
        map.set(key, item)
        continue
      }
      const shouldReplace =
        keep === 'latest'
          ? item.createdAt.getTime() > prev.createdAt.getTime()
          : item.createdAt.getTime() < prev.createdAt.getTime()
      if (shouldReplace) {
        map.set(key, item)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
  }

  const triggeredReminderLogs = uniqueByDateTime(
    validReminderLogs.filter(isTriggeredReminder),
    'latest'
  )
  const triggeredSentAtSet = new Set(triggeredReminderLogs.map(item => item.sentAt.getTime()))
  const scheduledReminders = uniqueByDateTime(
    validReminderLogs.filter(
      item => !isTriggeredReminder(item) && !triggeredSentAtSet.has(item.sentAt.getTime())
    ),
    'earliest'
  ).map(toReminderDto)
  const triggeredReminders = triggeredReminderLogs.map(toReminderDto)
  const now = new Date()

  return {
    upcomingReminder:
      clientRecord.reminderDate != null && clientRecord.reminderDate.getTime() > now.getTime()
        ? {
            dateTime: clientRecord.reminderDate,
            note: clientRecord.reminderNote ?? null,
          }
        : null,
    scheduledReminders,
    triggeredReminders,
  }
}

async function triggerDueClientRemindersForBusiness(businessId: string): Promise<number> {
  const now = new Date()
  const dueClients = await prisma.client.findMany({
    where: {
      businessId,
      reminderDate: { lte: now },
    },
    select: {
      id: true,
      businessId: true,
      name: true,
      email: true,
      reminderDate: true,
      reminderNote: true,
      business: {
        select: {
          name: true,
          email: true,
          settings: { select: { replyToEmail: true } },
        },
      },
    },
  })

  let triggeredCount = 0
  for (const dueClient of dueClients) {
    if (!dueClient.reminderDate) {
      continue
    }
    const dueDate = dueClient.reminderDate
    const triggered = await prisma.$transaction(async tx => {
      const claim = await tx.client.updateMany({
        where: {
          id: dueClient.id,
          businessId: dueClient.businessId,
          reminderDate: dueDate,
        },
        data: {
          status: 'FOLLOW_UP',
          reminderDate: null,
          reminderNote: null,
        },
      })
      if (claim.count === 0) {
        return false
      }
      await tx.reminderLog.create({
        data: {
          reminderType: 'CLIENT_FOLLOW_UP',
          sentAt: dueDate,
          note: dueClient.reminderNote ?? null,
          channel: 'EMAIL',
          entityType: 'CLIENT',
          entityId: dueClient.id,
          clientId: dueClient.id,
          businessId: dueClient.businessId,
        },
      })
      return true
    })
    if (triggered) {
      triggeredCount += 1
      try {
        const clientEmail = dueClient.email?.trim()
        if (clientEmail) {
          const companyReplyTo =
            dueClient.business.settings?.replyToEmail?.trim() || dueClient.business.email
          sendCustomerReminderEmail({
            to: clientEmail,
            clientName: dueClient.name,
            businessName: dueClient.business.name,
            companyReplyTo,
            workOrderTitle: 'Customer follow-up',
            reminderDateTime: dueDate,
            note: dueClient.reminderNote ?? null,
          })
        }
      } catch (error) {
        console.error('[CLIENT] Failed to send triggered reminder email:', error)
      }
    }
  }

  return triggeredCount
}

export async function triggerDueClientReminders(): Promise<number> {
  const businesses = await prisma.business.findMany({
    select: { id: true },
  })
  let totalTriggered = 0
  for (const business of businesses) {
    totalTriggered += await triggerDueClientRemindersForBusiness(business.id)
  }
  return totalTriggered
}

export async function createClientCustomerReminder(
  businessId: string,
  clientId: string,
  data: { dateTime: Date; note?: string | null }
) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true, name: true, email: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  await prisma.$transaction(async tx => {
    await tx.client.update({
      where: { id: client.id },
      data: {
        reminderDate: data.dateTime,
        reminderNote: data.note ?? null,
      },
    })

    await tx.reminderLog.create({
      data: {
        reminderType: 'CLIENT_FOLLOW_UP',
        sentAt: data.dateTime,
        note: data.note ?? null,
        channel: 'EMAIL',
        entityType: 'CLIENT',
        entityId: clientId,
        clientId: client.id,
        businessId,
      },
    })
  })

  return listClientCustomerReminders(businessId, clientId)
}

export async function getClientCustomerReminderById(
  businessId: string,
  clientId: string,
  reminderId: string
) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const reminder = await prisma.reminderLog.findFirst({
    where: { id: reminderId, businessId, clientId: client.id, reminderType: 'CLIENT_FOLLOW_UP' },
  })
  if (!reminder || reminder.createdAt.getTime() >= reminder.sentAt.getTime()) {
    throw new ClientReminderNotFoundError()
  }

  return {
    id: reminder.id,
    dateTime: reminder.sentAt,
    note: reminder.note ?? null,
    createdAt: reminder.createdAt,
  }
}

export async function updateClientCustomerReminderById(
  businessId: string,
  clientId: string,
  reminderId: string,
  data: { dateTime?: Date; note?: string | null }
) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true, reminderDate: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const existing = await prisma.reminderLog.findFirst({
    where: { id: reminderId, businessId, clientId: client.id, reminderType: 'CLIENT_FOLLOW_UP' },
  })
  if (!existing || existing.createdAt.getTime() >= existing.sentAt.getTime()) {
    throw new ClientReminderNotFoundError()
  }

  const nextDateTime = data.dateTime ?? existing.sentAt
  await prisma.$transaction(async tx => {
    await tx.reminderLog.update({
      where: { id: existing.id },
      data: {
        sentAt: nextDateTime,
        ...(data.note !== undefined && { note: data.note ?? null }),
      },
    })

    if (
      client.reminderDate != null &&
      client.reminderDate.getTime() === existing.sentAt.getTime()
    ) {
      await tx.client.update({
        where: { id: client.id },
        data: {
          reminderDate: nextDateTime,
          ...(data.note !== undefined && { reminderNote: data.note ?? null }),
        },
      })
    }
  })

  return getClientCustomerReminderById(businessId, clientId, reminderId)
}

export async function deleteClientCustomerReminderById(
  businessId: string,
  clientId: string,
  reminderId: string
) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true, reminderDate: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const existing = await prisma.reminderLog.findFirst({
    where: { id: reminderId, businessId, clientId: client.id, reminderType: 'CLIENT_FOLLOW_UP' },
    select: { id: true, sentAt: true, createdAt: true },
  })
  if (!existing || existing.createdAt.getTime() >= existing.sentAt.getTime()) {
    throw new ClientReminderNotFoundError()
  }

  await prisma.$transaction(async tx => {
    await tx.reminderLog.delete({ where: { id: existing.id } })
    if (
      client.reminderDate != null &&
      client.reminderDate.getTime() === existing.sentAt.getTime()
    ) {
      await tx.client.update({
        where: { id: client.id },
        data: { reminderDate: null, reminderNote: null },
      })
    }
  })
}
