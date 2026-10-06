import { z } from 'zod';

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EG_MOBILE = /^01[0125]\d{8}$/;

export const normalizePhone = (value) =>
  value
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/[\s\-().]/g, '')
    .replace(/^(\+20|0020)/, '0');

const requiredText = (t, field, min, max) =>
  z
    .string({ message: t(`order.validation.${field}Required`) })
    .trim()
    .min(min, t(`order.validation.${field}Min`))
    .max(max, t(`order.validation.${field}Max`));

export const shippingAddressSchema = (t) =>
  z.object({
    name: requiredText(t, 'name', 3, 80),
    phone: z
      .string({ message: t('order.validation.phoneRequired') })
      .transform(normalizePhone)
      .refine((v) => EG_MOBILE.test(v), t('order.validation.phoneInvalid')),
    address: requiredText(t, 'address', 10, 250),
    city: requiredText(t, 'city', 2, 60),
    notes: z
      .string()
      .trim()
      .max(300, t('order.validation.notesMax'))
      .optional()
      .transform((v) => v || null)
});