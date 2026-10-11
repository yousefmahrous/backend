import { z } from 'zod';

const blankToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const createPayoutSchema = (t) =>
  z.object({
    reference: z
      .string({ message: t('payout.validation.referenceRequired') })
      .trim()
      .min(1, t('payout.validation.referenceRequired'))
      .max(100, t('payout.validation.referenceMax')),
    note: z.preprocess(
      blankToUndefined,
      z.string().trim().max(300, t('payout.validation.noteMax')).optional()
    )
});