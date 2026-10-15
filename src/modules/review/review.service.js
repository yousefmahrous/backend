import * as reviewRepo from './review.repository.js';
import logger from '../../core/logger.js';

const serializeReview = (review) => ({
  id: review.id,
  rating: review.rating,
  comment: review.comment,
  created_at: review.created_at,
  updated_at: review.updated_at,
  user: {
    id: review.user.id,
    name: review.user.name
  }
});

export const getReviewsForProduct = async (t, productId, page = 1, limit = 10) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, Math.min(50, parseInt(limit) || 10));
    const skip = (pageNumber - 1) * limitNumber;

    const product = await reviewRepo.getProductById(productId);
    if (!product) {
      return { success: false, status: 404, message: t('review.productNotFound') };
    }

    const { reviews, totalCount } = await reviewRepo.getReviewsByProduct(productId, skip, limitNumber);
    const totalPages = Math.ceil(totalCount / limitNumber);

    return {
      success: true,
      status: 200,
      data: {
        reviews: reviews.map(serializeReview),
        rating_average: product.rating_average,
        reviews_count: product.reviews_count,
        pagination: {
          totalCount,
          totalPages,
          currentPage: pageNumber,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1
        }
      }
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('review.serverError') };
  }
};

export const addOrUpdateReview = async (t, userId, productId, reviewData) => {
  try {
    const product = await reviewRepo.getProductById(productId);
    if (!product) {
      return { success: false, status: 404, message: t('review.productNotFound') };
    }

    const existing = await reviewRepo.findReview(userId, productId);
    const isUpdate = Boolean(existing);

    const { review, productRating } = await reviewRepo.upsertReview(
      userId,
      productId,
      reviewData.rating,
      reviewData.comment
    );

    return {
      success: true,
      status: isUpdate ? 200 : 201,
      message: isUpdate ? t('review.updated') : t('review.added'),
      data: {
        review: serializeReview(review),
        rating_average: productRating.ratingAverage,
        reviews_count: productRating.reviewsCount
      }
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('review.saveError') };
  }
};

export const deleteReview = async (t, reviewId, userId, isAdmin) => {
  try {
    const review = await reviewRepo.getReviewById(reviewId);
    if (!review) {
      return { success: false, status: 404, message: t('review.notFound') };
    }

    if (!isAdmin && review.user_id !== userId) {
      return { success: false, status: 403, message: t('review.notAllowedToDelete') };
    }

    const { productRating } = await reviewRepo.deleteReview(reviewId, review.product_id);

    return {
      success: true,
      status: 200,
      message: t('review.deleted'),
      data: {
        rating_average: productRating.ratingAverage,
        reviews_count: productRating.reviewsCount
      }
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('review.deleteError') };
  }
};