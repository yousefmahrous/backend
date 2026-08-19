import * as reviewRepo from './review.repository.js';

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

export const getReviewsForBook = async (bookId, page = 1, limit = 10) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, Math.min(50, parseInt(limit) || 10));
    const skip = (pageNumber - 1) * limitNumber;

    const book = await reviewRepo.getBookById(bookId);
    if (!book) {
      return { success: false, status: 404, message: 'الكتاب غير موجود' };
    }

    const { reviews, totalCount } = await reviewRepo.getReviewsByBook(bookId, skip, limitNumber);
    const totalPages = Math.ceil(totalCount / limitNumber);

    return {
      success: true,
      status: 200,
      data: {
        reviews: reviews.map(serializeReview),
        rating_average: book.rating_average,
        reviews_count: book.reviews_count,
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
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ في السيرفر' };
  }
};

export const addOrUpdateReview = async (userId, bookId, reviewData) => {
  try {
    const book = await reviewRepo.getBookById(bookId);
    if (!book) {
      return { success: false, status: 404, message: 'الكتاب غير موجود' };
    }

    const existing = await reviewRepo.findReview(userId, bookId);
    const isUpdate = Boolean(existing);

    const { review, bookRating } = await reviewRepo.upsertReview(
      userId,
      bookId,
      reviewData.rating,
      reviewData.comment
    );

    return {
      success: true,
      status: isUpdate ? 200 : 201,
      message: isUpdate ? 'تم تعديل تقييمك بنجاح' : 'تم إضافة تقييمك بنجاح',
      data: {
        review: serializeReview(review),
        rating_average: bookRating.ratingAverage,
        reviews_count: bookRating.reviewsCount
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء حفظ التقييم' };
  }
};

export const deleteReview = async (reviewId, userId, isAdmin) => {
  try {
    const review = await reviewRepo.getReviewById(reviewId);
    if (!review) {
      return { success: false, status: 404, message: 'التقييم غير موجود' };
    }

    if (!isAdmin && review.user_id !== userId) {
      return { success: false, status: 403, message: 'غير مصرح لك بحذف هذا التقييم' };
    }

    const { bookRating } = await reviewRepo.deleteReview(reviewId, review.book_id);

    return {
      success: true,
      status: 200,
      message: 'تم حذف التقييم بنجاح',
      data: {
        rating_average: bookRating.ratingAverage,
        reviews_count: bookRating.reviewsCount
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء حذف التقييم' };
  }
};