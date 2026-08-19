import { z } from 'zod';

export const reviewSchema = z.object({
  rating: z.coerce.number({ invalid_type_error: 'التقييم لازم يكون رقم' })
    .int('التقييم لازم يكون رقم صحيح')
    .min(1, 'التقييم لازم يكون من 1 إلى 5')
    .max(5, 'التقييم لازم يكون من 1 إلى 5'),

  comment: z.string()
    .trim()
    .min(3, 'التعليق لازم يكون 3 حروف على الأقل')
    .max(1000, 'التعليق طويل جدًا')
});