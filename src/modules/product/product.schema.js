import { z } from 'zod';

const bilingualField = (t, label, min) =>
  z.object({
    ar: z.string().trim().min(min, t(`product.validation.${label}Min`, { lang: 'AR' })),
    en: z.string().trim().min(min, t(`product.validation.${label}Min`, { lang: 'EN' })),
  });

const blankToNull = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

const optionalField = (schema) => z.preprocess(blankToNull, schema.nullable().optional());

const priceField = (t) =>
  z.coerce.number({ invalid_type_error: t('product.validation.priceType') })
    .min(0, t('product.validation.priceNegative'))
    .transform((val) => Math.round(val * 100));

const stockField = (t) =>
  z.coerce.number({ invalid_type_error: t('product.validation.stockType') })
    .int(t('product.validation.stockInt'))
    .min(0, t('product.validation.stockNegative'));

const variantSchema = (t) =>
  z.object({
    sku: optionalField(z.string().trim().min(1).max(100)),
    options: z.record(z.string().trim().min(1), z.string().trim().min(1)).default({}),
    price: priceField(t),
    stock: stockField(t),
  });

const optionsKey = (options) =>
  JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));

export const createProductSchema = (t) =>
  z
    .object({
      name: bilingualField(t, 'title', 3),

      number: optionalField(
        z.string()
          .trim()
          .regex(/^(?:\d[- ]?){9,17}\d$/, t('product.validation.isbnInvalid'))
      ),

      email: optionalField(
        z.string()
          .trim()
          .email(t('product.validation.emailInvalid'))
      ),

      adress: bilingualField(t, 'description', 5),

      centre: optionalField(
        z.string()
          .trim()
          .min(2, t('product.validation.publisherMin'))
      ),

      category: z.string({ message: t('product.validation.categoryInvalid') })
        .trim()
        .min(1, t('product.validation.categoryInvalid')),

      stock: stockField(t).optional(),
      price: priceField(t).optional(),

      variants: z.array(variantSchema(t)).min(1).max(50).optional(),

      avatar_key: z.string().trim().nullable().optional()
    })
    .superRefine((data, ctx) => {
      if (!data.variants) {
        if (data.price === undefined) {
          ctx.addIssue({ code: 'custom', path: ['price'], message: t('product.validation.priceType') });
        }
        if (data.stock === undefined) {
          ctx.addIssue({ code: 'custom', path: ['stock'], message: t('product.validation.stockType') });
        }
        return;
      }

      const seenOptions = new Set();
      const seenSkus = new Set();
      data.variants.forEach((v, index) => {
        const key = optionsKey(v.options);
        if (seenOptions.has(key)) {
          ctx.addIssue({ code: 'custom', path: ['variants', index, 'options'], message: t('product.validation.variantDuplicate') });
        }
        seenOptions.add(key);
        if (v.sku) {
          if (seenSkus.has(v.sku)) {
            ctx.addIssue({ code: 'custom', path: ['variants', index, 'sku'], message: t('product.validation.variantDuplicate') });
          }
          seenSkus.add(v.sku);
        }
      });
    })

    .transform((data) => {
      const variants = data.variants ?? [
        { sku: null, options: {}, price: data.price, stock: data.stock },
      ];
      return { ...data, variants, price: variants[0].price, stock: variants[0].stock };
    });


export const createEditProductSchema = (t) =>
  z.object({
    name: bilingualField(t, 'title', 3),
    adress: bilingualField(t, 'description', 5),
    email: optionalField(z.string().trim().email(t('product.validation.emailInvalid'))),
    stock: stockField(t).optional(),
    price: priceField(t).optional(),
  });

export const variantInputSchema = (t) => variantSchema(t);