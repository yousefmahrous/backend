import { z } from 'zod';
import { MAX_COMMISSION_BPS } from '../commission/commission.js';
import { MAX_PAYOUT_HOLD_DAYS } from '../payout/payout.constants.js';

const bps = (t) =>
  z
    .number({ message: t('settings.validation.bpsInvalid') })
    .int(t('settings.validation.bpsInvalid'))
    .min(0, t('settings.validation.bpsInvalid'))
    .max(MAX_COMMISSION_BPS, t('settings.validation.bpsInvalid'));

export const updateCommissionSettingsSchema = (t) =>
  z
    .object({
      default_commission_bps: bps(t).optional(),
      payout_hold_days: z
        .number({ message: t('settings.validation.holdDaysInvalid') })
        .int(t('settings.validation.holdDaysInvalid'))
        .min(0, t('settings.validation.holdDaysInvalid'))
        .max(MAX_PAYOUT_HOLD_DAYS, t('settings.validation.holdDaysInvalid'))
        .optional()
    })
    .refine((data) => Object.keys(data).length > 0, { message: t('settings.validation.nothingToUpdate') });

export const updateVendorCommissionSchema = (t) =>
  z.object({ commission_bps: bps(t).nullable() });