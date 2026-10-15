import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./review.repository.js', () => ({
  getProductById: vi.fn(),
  getReviewsByProduct: vi.fn(),
  findReview: vi.fn(),
  getReviewById: vi.fn(),
  upsertReview: vi.fn(),
  deleteReview: vi.fn(),
}));

const reviewRepo = await import('./review.repository.js');
const reviewService = await import('./review.service.js');

const t = fakeT;

const makeReview = (overrides = {}) => ({
  id: 1,
  rating: 5,
  comment: 'great',
  created_at: 'a',
  updated_at: 'a',
  user: { id: 5, name: 'Ali' },
  ...overrides,
});

describe('review.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getReviewsForProduct', () => {
    it('returns 404 when the product does not exist', async () => {
      reviewRepo.getProductById.mockResolvedValue(null);

      const result = await reviewService.getReviewsForProduct(t, 999);

      expect(result).toEqual({ success: false, status: 404, message: 'review.productNotFound' });
      expect(reviewRepo.getReviewsByProduct).not.toHaveBeenCalled();
    });

    it('paginates with sane defaults and includes the product rating summary', async () => {
      reviewRepo.getProductById.mockResolvedValue({ rating_average: 4.5, reviews_count: 2 });
      reviewRepo.getReviewsByProduct.mockResolvedValue({ reviews: [makeReview()], totalCount: 2 });

      const result = await reviewService.getReviewsForProduct(t, 1);

      expect(reviewRepo.getReviewsByProduct).toHaveBeenCalledWith(1, 0, 10);
      expect(result.data).toMatchObject({
        rating_average: 4.5,
        reviews_count: 2,
        pagination: { totalCount: 2, currentPage: 1 },
      });
    });

    it('caps the page size at 50', async () => {
      reviewRepo.getProductById.mockResolvedValue({ rating_average: 0, reviews_count: 0 });
      reviewRepo.getReviewsByProduct.mockResolvedValue({ reviews: [], totalCount: 0 });

      await reviewService.getReviewsForProduct(t, 1, 1, 500);

      expect(reviewRepo.getReviewsByProduct).toHaveBeenCalledWith(1, 0, 50);
    });
  });

  describe('addOrUpdateReview', () => {
    it('returns 404 when the product does not exist', async () => {
      reviewRepo.getProductById.mockResolvedValue(null);

      const result = await reviewService.addOrUpdateReview(t, 5, 999, { rating: 5, comment: 'great' });

      expect(result).toEqual({ success: false, status: 404, message: 'review.productNotFound' });
      expect(reviewRepo.upsertReview).not.toHaveBeenCalled();
    });

    it('returns 201 with an "added" message when the user has no existing review', async () => {
      reviewRepo.getProductById.mockResolvedValue({ id: 1 });
      reviewRepo.findReview.mockResolvedValue(null);
      reviewRepo.upsertReview.mockResolvedValue({
        review: makeReview(),
        productRating: { ratingAverage: 5, reviewsCount: 1 },
      });

      const result = await reviewService.addOrUpdateReview(t, 5, 1, { rating: 5, comment: 'great' });

      expect(reviewRepo.upsertReview).toHaveBeenCalledWith(5, 1, 5, 'great');
      expect(result).toMatchObject({ success: true, status: 201, message: 'review.added' });
    });

    it('returns 200 with an "updated" message when the user already reviewed this product', async () => {
      reviewRepo.getProductById.mockResolvedValue({ id: 1 });
      reviewRepo.findReview.mockResolvedValue(makeReview());
      reviewRepo.upsertReview.mockResolvedValue({
        review: makeReview({ rating: 3 }),
        productRating: { ratingAverage: 4, reviewsCount: 1 },
      });

      const result = await reviewService.addOrUpdateReview(t, 5, 1, { rating: 3, comment: 'meh' });

      expect(result).toMatchObject({ success: true, status: 200, message: 'review.updated' });
    });
  });

  describe('deleteReview', () => {
    it('returns 404 when the review does not exist', async () => {
      reviewRepo.getReviewById.mockResolvedValue(null);

      const result = await reviewService.deleteReview(t, 1, 5, false);

      expect(result).toEqual({ success: false, status: 404, message: 'review.notFound' });
      expect(reviewRepo.deleteReview).not.toHaveBeenCalled();
    });

    it('refuses to let a non-admin delete someone else\'s review', async () => {
      reviewRepo.getReviewById.mockResolvedValue({ id: 1, user_id: 9, product_id: 1 });

      const result = await reviewService.deleteReview(t, 1, 5, false);

      expect(result).toEqual({ success: false, status: 403, message: 'review.notAllowedToDelete' });
      expect(reviewRepo.deleteReview).not.toHaveBeenCalled();
    });

    it('lets the review\'s owner delete it', async () => {
      reviewRepo.getReviewById.mockResolvedValue({ id: 1, user_id: 5, product_id: 1 });
      reviewRepo.deleteReview.mockResolvedValue({ productRating: { ratingAverage: 0, reviewsCount: 0 } });

      const result = await reviewService.deleteReview(t, 1, 5, false);

      expect(reviewRepo.deleteReview).toHaveBeenCalledWith(1, 1);
      expect(result).toMatchObject({ success: true, status: 200, message: 'review.deleted' });
    });

    it('lets an admin delete someone else\'s review', async () => {
      reviewRepo.getReviewById.mockResolvedValue({ id: 1, user_id: 9, product_id: 1 });
      reviewRepo.deleteReview.mockResolvedValue({ productRating: { ratingAverage: 0, reviewsCount: 0 } });

      const result = await reviewService.deleteReview(t, 1, 5, true);

      expect(result).toMatchObject({ success: true, status: 200 });
    });
  });
});
