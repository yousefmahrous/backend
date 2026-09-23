import { z } from 'zod';

const bilingualField = (t, label, min) =>
  z.object({
    ar: z.string().trim().min(min, t(`book.validation.${label}Min`, { lang: 'AR' })),
    en: z.string().trim().min(min, t(`book.validation.${label}Min`, { lang: 'EN' })),
  });

export const createBookSchema = (t) =>
  z.object({
    name: bilingualField(t, 'title', 3),

    number: z.string()
      .trim()
      .regex(/^(?:\d[- ]?){9,17}\d$/, t('book.validation.isbnInvalid')),

    email: z.string()
      .trim()
      .email(t('book.validation.emailInvalid')),

    adress: bilingualField(t, 'description', 5),

    centre: z.string()
      .trim()
      .min(2, t('book.validation.publisherMin')),

    category: z.string({ message: t('book.validation.categoryInvalid') })
      .trim()
     .min(1, t('book.validation.categoryInvalid')),

    stock: z.coerce.number({ invalid_type_error: t('book.validation.stockType') })
      .int(t('book.validation.stockInt'))
      .min(0, t('book.validation.stockNegative')),

    price: z.coerce.number({ invalid_type_error: t('book.validation.priceType') })
      .min(0, t('book.validation.priceNegative'))
      .transform((val) => Math.round(val * 100)),

    avatar_key: z.string().trim().nullable().optional()
  });

export const createEditBookSchema = (t) =>
  z.object({
    name: bilingualField(t, 'title', 3),
    adress: bilingualField(t, 'description', 5),
    email: z.string().trim().email(t('book.validation.emailInvalid')),
    stock: z.coerce.number({ invalid_type_error: t('book.validation.stockType') })
      .int(t('book.validation.stockInt'))
      .min(0, t('book.validation.stockNegative')),
    price: z.coerce.number({ invalid_type_error: t('book.validation.priceType') })
      .min(0, t('book.validation.priceNegative'))
      .transform((val) => Math.round(val * 100)),
  });