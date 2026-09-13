import { z } from 'zod';

export const createReviewSchema = (t) =>
  z.object({
    rating: z.coerce.number({ invalid_type_error: t('review.validation.ratingType') })
      .int(t('review.validation.ratingInt'))
      .min(1, t('review.validation.ratingRange'))
      .max(5, t('review.validation.ratingRange')),

    comment: z.string()
      .trim()
      .min(3, t('review.validation.commentMin'))
      .max(1000, t('review.validation.commentMax'))
  });