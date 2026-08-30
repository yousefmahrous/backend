import express from 'express';
import * as reviewService from '../../modules/review/review.service.js';
import { reviewSchema } from '../../modules/review/review.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.get('/books/:bookId', async (req, res) => {
  const { page, limit } = req.query;
  const { status, ...response } = await reviewService.getReviewsForBook(
    parseInt(req.params.bookId),
    page,
    limit
  );
  res.status(status).json(response);
});

router.post('/books/:bookId', authMiddleware, doubleCsrfProtection, async (req, res) => {
  if (req.user.role === 'admin') {
    return res.status(403).json({ success: false, message: 'التقييمات متاحة للعملاء فقط' });
  }

  const result = reviewSchema.safeParse(req.body);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    return res.status(400).json({ success: false, errors: fieldErrors });
  }

  const { status, ...response } = await reviewService.addOrUpdateReview(
    req.user.id,
    parseInt(req.params.bookId),
    result.data
  );
  res.status(status).json(response);
});

router.delete('/:id', authMiddleware, doubleCsrfProtection, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { status, ...response } = await reviewService.deleteReview(
    parseInt(req.params.id),
    req.user.id,
    isAdmin
  );
  res.status(status).json(response);
});

export default router;