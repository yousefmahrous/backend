import express from 'express';
import * as bookService from '../../modules/book/book.service.js';
import { validateAdd, validateEdit } from '../../core/middlewares/validation.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';
import { BOOK_CATEGORY_KEYS } from '../../modules/book/book.constants.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { page, limit, search, category } = req.query;
  const safeCategory = BOOK_CATEGORY_KEYS.includes(category) ? category : '';
  const { status, ...response } = await bookService.getAllBooks(req.t, page, limit, search, safeCategory);
  res.status(status).json(response);
});

router.post('/', authMiddleware, requireAdmin, doubleCsrfProtection, validateAdd, async (req, res) => {
  const { status, ...response } = await bookService.addBook(req.t, req.body);
  res.status(status).json(response);
});

router.get('/popular', async (req, res) => {
  const { limit } = req.query;
  const { status, ...response } = await bookService.getPopularBooks(req.t, limit);
  res.status(status).json(response);
});

router.get('/:id', async (req, res) => {
  const { status, ...response } = await bookService.getBookById(req.t, req.params.id);
  res.status(status).json(response);
});

router.delete('/:id', authMiddleware, requireAdmin, doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await bookService.deleteBook(req.t, req.params.id);
  res.status(status).json(response);
});

router.put('/:id', authMiddleware, requireAdmin, doubleCsrfProtection, validateEdit, async (req, res) => {
  const { status, ...response } = await bookService.editBook(req.t, req.params.id, req.body);
  res.status(status).json(response);
});

export default router;