import express from 'express';
import * as favoriteService from '../../modules/favorite/favorite.service.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);

router.use((req, res, next) => {
  if (req.user.role === 'admin') {
    return res.status(403).json({ success: false, message: req.t('favorite.customersOnly') });
  }
  next();
});

router.get('/', async (req, res) => {
  const { status, ...response } = await favoriteService.getFavorites(req.t, req.user.id);
  res.status(status).json(response);
});

router.post('/items', doubleCsrfProtection, async (req, res) => {
  const { book_id } = req.body;
  if (!book_id) {
    return res.status(400).json({ success: false, message: req.t('favorite.bookIdRequired') });
  }
  const { status, ...response } = await favoriteService.addFavorite(req.t, req.user.id, parseInt(book_id));
  res.status(status).json(response);
});

router.delete('/items/:bookId', doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await favoriteService.removeFavorite(
    req.t,
    req.user.id,
    parseInt(req.params.bookId)
  );
  res.status(status).json(response);
});

export default router;