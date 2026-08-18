import express from 'express';
import * as bookService from '../../modules/book/book.service.js';
import { validateAdd, validateEdit } from '../../core/middlewares/validation.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { page, limit, search } = req.query;
  const { status, ...response } = await bookService.getAllBooks(page, limit, search);
  res.status(status).json(response);
});

router.post('/', authMiddleware, requireAdmin, validateAdd, async (req, res) => {
  const { status, ...response } = await bookService.addBook(req.body);
  res.status(status).json(response);
});

router.get('/popular', async (req, res) => {
  const { limit } = req.query;
  const { status, ...response } = await bookService.getPopularBooks(limit);
  res.status(status).json(response);
});

router.get('/:id', async (req, res) => {
  const { status, ...response } = await bookService.getBookById(req.params.id);
  res.status(status).json(response);
});

router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { status, ...response } = await bookService.deleteBook(req.params.id);
  res.status(status).json(response);
});

router.put('/:id', authMiddleware, requireAdmin, validateEdit, async (req, res) => {
  const { status, ...response } = await bookService.editBook(req.params.id, req.body);
  res.status(status).json(response);
});

export default router;