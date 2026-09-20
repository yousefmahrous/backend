import { z } from 'zod';
import { VENDOR_ASSIGNABLE_STATUSES } from './vendor.constants.js';

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