import { z } from 'zod';

export const categorySchema = (t) =>
  z.object({
    slug: z
      .string({ message: t('category.validation.slugRequired') })
      .trim()
      .min(2, t('category.validation.slugMin'))
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t('category.validation.slugFormat')),

    name: z.object(
      {
        ar: z.string().trim().min(1, t('category.validation.nameRequired')),
        en: z.string().trim().min(1, t('category.validation.nameRequired')),
      },
      { message: t('category.validation.nameRequired') }
    ),

    parent_id: z.coerce.number().int().positive().nullable().optional(),
  });
