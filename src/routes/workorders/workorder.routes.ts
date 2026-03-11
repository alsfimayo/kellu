/**
 * Workorder API routes – §6 Workorder Management.
 * List (with filters + search), overview blocks, get one, create, update, delete, register payment.
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const QuoteStatusEnum = z.enum([
  'NOT_SENT',
  'AWAITING_RESPONSE',
  'APPROVED',
  'CONVERTED',
  'REJECTED',
  'EXPIRED',
])
const JobStatusEnum = z.enum([
  'UNSCHEDULED',
  'UNASSIGNED',
  'SCHEDULED',
  'ON_MY_WAY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
])
const InvoiceStatusEnum = z.enum([
  'NOT_SENT',
  'AWAITING_PAYMENT',
  'OVERDUE',
  'PAID',
  'BAD_DEBT',
  'CANCELLED',
])
const DiscountTypeEnum = z.enum(['PERCENTAGE', 'AMOUNT'])
const ItemTypeEnum = z.enum(['SERVICE', 'PRODUCT'])
const PaymentMethodEnum = z.enum([
  'CASH',
  'CARD',
  'TRANSFER',
  'MERCADOPAGO',
  'TRANSBANK',
  'OTHER',
])

export const WorkOrderParamsSchema = z.object({
  workOrderId: z.string().openapi({ param: { name: 'workOrderId', in: 'path' }, description: 'Work order ID' }),
})

export const WorkOrderListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({ param: { name: 'search', in: 'query' }, description: 'Search by client name, title, or address' }),
  quoteStatus: QuoteStatusEnum.optional().openapi({
    param: { name: 'quoteStatus', in: 'query' },
    description: 'Filter by quote status',
  }),
  jobStatus: JobStatusEnum.optional().openapi({
    param: { name: 'jobStatus', in: 'query' },
    description: 'Filter by job status',
  }),
  invoiceStatus: InvoiceStatusEnum.optional().openapi({
    param: { name: 'invoiceStatus', in: 'query' },
    description: 'Filter by invoice status',
  }),
  sortBy: z
    .enum(['scheduledAt', 'createdAt', 'updatedAt', 'title'])
    .optional()
    .openapi({ param: { name: 'sortBy', in: 'query' } }),
  order: z.enum(['asc', 'desc']).optional().openapi({ param: { name: 'order', in: 'query' } }),
  page: z.string().optional().openapi({ param: { name: 'page', in: 'query' } }),
  limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' } }),
})

const LineItemCreateSchema = z.object({
  name: z.string().min(1),
  itemType: ItemTypeEnum.optional().default('SERVICE'),
  description: z.string().optional().nullable(),
  quantity: z.number().int().min(1),
  price: z.number(),
  cost: z.number().optional().nullable(),
  priceListItemId: z.string().optional().nullable(),
})

export const CreateWorkOrderBodySchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    clientId: z.string().min(1, 'Client is required'),
    address: z.string().min(1, 'Address is required'),
    isScheduleLater: z.boolean().optional().default(false),
    scheduledAt: z.coerce.date().optional().nullable(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    assignedToId: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    quoteRequired: z.boolean().optional().default(false),
    quoteTermsConditions: z.string().optional().nullable(),
    invoiceTermsConditions: z.string().optional().nullable(),
    discount: z.number().optional(),
    discountType: DiscountTypeEnum.optional().nullable(),
    taxPercent: z.number().optional().nullable(),
    lineItems: z.array(LineItemCreateSchema).optional(),
  })
  .openapi({ description: 'Create work order payload' })

export const UpdateWorkOrderBodySchema = CreateWorkOrderBodySchema.partial().openapi({
  description: 'Update work order – partial',
})

export const RegisterPaymentBodySchema = z
  .object({
    amount: z.number().positive(),
    paymentDate: z.coerce.date(),
    paymentMethod: PaymentMethodEnum,
    referenceNumber: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
  })
  .openapi({ description: 'Register payment on work order' })

const WorkOrderListItemSchema = z.object({
  id: z.string(),
  workOrderNumber: z.string().nullable(),
  title: z.string(),
  address: z.string(),
  scheduledAt: z.coerce.date().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  quoteStatus: QuoteStatusEnum,
  jobStatus: JobStatusEnum,
  invoiceStatus: InvoiceStatusEnum,
  total: z.union([z.number(), z.string()]).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string(),
  }),
  assignedTo: z
    .object({
      id: z.string(),
      user: z.object({ name: z.string().nullable(), email: z.string() }),
    })
    .nullable(),
})

const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

export const WorkOrderListResponseSchema = z.object({
  data: z.array(WorkOrderListItemSchema),
  pagination: PaginationSchema,
})

const StatusCountSchema = z.object({
  status: z.string(),
  count: z.number().int(),
})

export const WorkOrderOverviewResponseSchema = z.object({
  quoteStatus: z.array(StatusCountSchema),
  jobStatus: z.array(StatusCountSchema),
  invoiceStatus: z.array(StatusCountSchema),
})

const LineItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  itemType: ItemTypeEnum,
  description: z.string().nullable(),
  quantity: z.number().int(),
  price: z.union([z.number(), z.string()]),
  cost: z.union([z.number(), z.string()]).nullable(),
})

const PaymentSchema = z.object({
  id: z.string(),
  amount: z.union([z.number(), z.string()]),
  paymentDate: z.coerce.date(),
  paymentMethod: z.string(),
  referenceNumber: z.string().nullable(),
  note: z.string().nullable(),
})

export const WorkOrderDetailResponseSchema = z.object({
  id: z.string(),
  workOrderNumber: z.string().nullable(),
  title: z.string(),
  address: z.string(),
  instructions: z.string().nullable(),
  notes: z.string().nullable(),
  isScheduleLater: z.boolean(),
  scheduledAt: z.coerce.date().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  quoteStatus: QuoteStatusEnum,
  jobStatus: JobStatusEnum,
  invoiceStatus: InvoiceStatusEnum,
  subtotal: z.union([z.number(), z.string()]).nullable(),
  discount: z.union([z.number(), z.string()]).nullable(),
  discountType: DiscountTypeEnum.nullable(),
  tax: z.union([z.number(), z.string()]).nullable(),
  total: z.union([z.number(), z.string()]).nullable(),
  cost: z.union([z.number(), z.string()]).nullable(),
  amountPaid: z.union([z.number(), z.string()]).nullable(),
  balance: z.union([z.number(), z.string()]).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  client: z.any(),
  assignedTo: z.any().nullable(),
  lineItems: z.array(LineItemSchema),
  payments: z.array(PaymentSchema),
})

export const WORK_ORDER_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Workorders'],
    path: '/',
    summary: 'List work orders with filters and pagination ',
    request: { query: WorkOrderListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  overview: createRoute({
    method: 'get',
    tags: ['Workorders'],
    path: '/overview',
    summary: 'Get quote/job/invoice status counts for overview blocks ',
    request: {},
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderOverviewResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Workorders'],
    path: '/{workOrderId}',
    summary: 'Get work order by ID with full details ',
    request: { params: WorkOrderParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  create: createRoute({
    method: 'post',
    tags: ['Workorders'],
    path: '/',
    summary: 'Create work order ',
    request: { body: jsonContentRequired(CreateWorkOrderBodySchema, 'Create work order payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or client not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Workorders'],
    path: '/{workOrderId}',
    summary: 'Update work order ',
    request: {
      params: WorkOrderParamsSchema,
      body: jsonContentRequired(UpdateWorkOrderBodySchema, 'Update payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  delete: createRoute({
    method: 'delete',
    tags: ['Workorders'],
    path: '/{workOrderId}',
    summary: 'Delete work order',
    request: { params: WorkOrderParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(z.object({ deleted: z.boolean() })), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  registerPayment: createRoute({
    method: 'post',
    tags: ['Workorders'],
    path: '/{workOrderId}/payments',
    summary: 'Register payment on work order ',
    request: {
      params: WorkOrderParamsSchema,
      body: jsonContentRequired(RegisterPaymentBodySchema, 'Payment payload'),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'Payment registered'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type WorkOrderRoutes = typeof WORK_ORDER_ROUTES
