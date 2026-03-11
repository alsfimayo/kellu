import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from 'stoker/http-status-codes';
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import {zodResponseSchema} from '~/lib/zod-helper';


export const CreateLineItemBodySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    itemType: z.enum(['SERVICE', 'PRODUCT']),
    description: z.string().optional(),
    quantity: z.number().min(1, 'Quantity is required'),
    price: z.number().min(0, 'Price is required'),
    cost: z.number().optional(),
    markupPercent: z.number().optional(),
    priceListItemId: z.string().optional(),
    workOrderId: z.string().optional(),
}).openapi({description: 'Create line item payload'})