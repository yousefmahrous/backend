import { z } from 'zod';
import {
  VENDOR_ASSIGNABLE_STATUSES,
  FULFILLMENT_ASSIGNABLE_STATUSES,
  FULFILLMENT_STATUS
} from './vendor.constants.js';

export const createVendorApplicationSchema = (t) =>
  z.object({
    store_name: z.string({ message: t('vendor.validation.storeNameRequired') })
      .trim()
      .min(3, t('vendor.validation.storeNameMin'))
      .max(60, t('vendor.validation.storeNameMax'))
});

export const updateVendorStatusSchema = (t) =>
  z.object({
    status: z.enum(VENDOR_ASSIGNABLE_STATUSES, {
      message: t('vendor.validation.statusInvalid')
    })
});

const blankToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const updateFulfillmentSchema = (t) =>
  z
    .object({
      status: z.enum(FULFILLMENT_ASSIGNABLE_STATUSES, {
        message: t('vendor.orders.validation.statusInvalid')
      }),
      carrier: z.preprocess(
        blankToUndefined,
        z.string().trim().max(60, t('vendor.orders.validation.carrierMax')).optional()
      ),
      tracking_number: z.preprocess(
        blankToUndefined,
        z.string().trim().max(80, t('vendor.orders.validation.trackingMax')).optional()
      )
    })
    .superRefine((data, ctx) => {
      if (data.status === FULFILLMENT_STATUS.SHIPPED && !data.carrier) {
        ctx.addIssue({
          code: 'custom',
          path: ['carrier'],
          message: t('vendor.orders.validation.carrierRequired')
        });
      }
    });