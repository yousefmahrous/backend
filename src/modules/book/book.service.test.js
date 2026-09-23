import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./book.repository.js', () => ({
  getAllBooks: vi.fn(),
  getBookById: vi.fn(),
  createBook: vi.fn(),
  deleteBook: vi.fn(),
  updateBook: vi.fn(),
  getPopularBooks: vi.fn(),
}));

vi.mock('../category/category.repository.js', () => ({
  findCategoryBySlug: vi.fn(),
}));

vi.mock('../../core/config/redis.client.js', () => ({
  default: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

const mockEmit = vi.fn();
vi.mock('../../core/config/socket.config.js', () => ({
  getIO: vi.fn(() => ({ emit: mockEmit })),
}));

const bookRepo = await import('./book.repository.js');
const categoryRepo = await import('../category/category.repository.js');
const redisClient = (await import('../../core/config/redis.client.js')).default;
const bookService = await import('./book.service.js');

const t = fakeT;

const makeBook = (overrides = {}) => ({
  id: 1,
  title: 'Book',
  isbn: '123',
  publisher_email: 'p@x.com',
  description: 'desc',
  publisher: 'Pub',
  category: 'fiction',
  price: 100,
  stock: 5,
  cover_url: 'http://x/cover.jpg',
  cover_key: 'cover-key',
  ...overrides,
});

describe('book.service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEmit.mockClear();
    redisClient.get.mockResolvedValue(null);
    redisClient.del.mockResolvedValue(undefined);
    categoryRepo.findCategoryBySlug.mockResolvedValue({ id: 3, slug: 'novels' });
  });

  describe('getAllBooks', () => {
    it('paginates with sane defaults and serializes each book', async () => {
      bookRepo.getAllBooks.mockResolvedValue({ books: [makeBook()], totalCount: 1 });

      const result = await bookService.getAllBooks(t);

      expect(bookRepo.getAllBooks).toHaveBeenCalledWith(0, 10, '', '');
      expect(result.data.users[0]).toMatchObject({ id: 1, name: 'Book', price: 100, stock: 5 });
      expect(result.data.pagination).toMatchObject({ totalCount: 1, totalPages: 1, currentPage: 1 });
    });

    it('computes skip correctly for later pages and forwards search/category filters', async () => {
      bookRepo.getAllBooks.mockResolvedValue({ books: [], totalCount: 0 });

      await bookService.getAllBooks(t, 3, 20, 'harry', 'fiction');

      expect(bookRepo.getAllBooks).toHaveBeenCalledWith(40, 20, 'harry', 'fiction');
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      bookRepo.getAllBooks.mockRejectedValue(new Error('db down'));

      const result = await bookService.getAllBooks(t);

      expect(result).toEqual({ success: false, status: 500, message: 'common.serverError' });
    });
  });

  describe('getBookById', () => {
    it('returns the cached book without touching the repository on a cache hit', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify({ id: 1, name: 'Cached' }));

      const result = await bookService.getBookById(t, 1);

      expect(result).toEqual({ success: true, status: 200, data: { user: { id: 1, name: 'Cached' } } });
      expect(bookRepo.getBookById).not.toHaveBeenCalled();
    });

    it('returns 404 when the book does not exist (and does not cache anything)', async () => {
      bookRepo.getBookById.mockResolvedValue(null);

      const result = await bookService.getBookById(t, 999);

      expect(result).toEqual({ success: false, status: 404, message: 'book.notFound' });
      expect(redisClient.set).not.toHaveBeenCalled();
    });

    it('fetches from the repository on a cache miss and caches the serialized result', async () => {
      bookRepo.getBookById.mockResolvedValue(makeBook());

      const result = await bookService.getBookById(t, 1);

      expect(redisClient.set).toHaveBeenCalledWith(
        'books:1',
        expect.stringContaining('"id":1'),
        { EX: 3600 }
      );
      expect(result).toMatchObject({ success: true, status: 200, data: { user: { id: 1, name: 'Book' } } });
    });
  });

  describe('addBook', () => {
    it('creates the book, invalidates the "all books" cache, and notifies over the socket', async () => {
      const result = await bookService.addBook(t, { title: 'New', category: 'novels' });

      expect(bookRepo.createBook).toHaveBeenCalledWith({ title: 'New', category: 'novels', category_id: 3 });
      expect(redisClient.del).toHaveBeenCalledWith('books:all');
      expect(mockEmit).toHaveBeenCalledWith('books_updated');
      expect(result).toEqual({ success: true, status: 201, message: 'book.added' });
    });

    it('looks the category up by its slug and links the book to it by id', async () => {
      categoryRepo.findCategoryBySlug.mockResolvedValue({ id: 8, slug: 'kids' });

      await bookService.addBook(t, { title: 'New', category: 'kids' });

      expect(categoryRepo.findCategoryBySlug).toHaveBeenCalledWith('kids');
      expect(bookRepo.createBook.mock.calls[0][0].category_id).toBe(8);
    });

    it('rejects an unknown category with a 400 on the category field and creates nothing', async () => {
      categoryRepo.findCategoryBySlug.mockResolvedValue(null);

      const result = await bookService.addBook(t, { title: 'New', category: 'hacked' });

      expect(result).toEqual({
        success: false,
        status: 400,
        errors: { category: ['book.validation.categoryInvalid'] },
      });
      expect(bookRepo.createBook).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      bookRepo.createBook.mockRejectedValue(new Error('db down'));

      const result = await bookService.addBook(t, { title: 'New', category: 'novels' });

      expect(result).toEqual({ success: false, status: 500, message: 'book.addError' });
    });

    it('still succeeds when Redis fails to invalidate the cache (soft failure, not fatal)', async () => {
      redisClient.del.mockRejectedValue(new Error('redis down'));

      const result = await bookService.addBook(t, { title: 'New', category: 'novels' });

      expect(result).toEqual({ success: true, status: 201, message: 'book.added' });
    });
  });

  describe('deleteBook', () => {
    it('deletes the book and clears both cache entries', async () => {
      const result = await bookService.deleteBook(t, 5);

      expect(bookRepo.deleteBook).toHaveBeenCalledWith(5);
      expect(redisClient.del).toHaveBeenCalledWith(['books:all', 'books:5']);
      expect(result).toEqual({ success: true, status: 200, message: 'book.deleted' });
    });

    it('returns 409 when the book is still referenced elsewhere (foreign key constraint)', async () => {
      const fkError = new Error('foreign key constraint failed');
      fkError.code = 'P2003';
      bookRepo.deleteBook.mockRejectedValue(fkError);

      const result = await bookService.deleteBook(t, 5);

      expect(result).toEqual({ success: false, status: 409, message: 'book.deleteForeignKey' });
    });

    it('returns a plain 500 for unrelated errors', async () => {
      bookRepo.deleteBook.mockRejectedValue(new Error('db down'));

      const result = await bookService.deleteBook(t, 5);

      expect(result).toEqual({ success: false, status: 500, message: 'book.deleteError' });
    });
  });

  describe('editBook', () => {
    it('updates the book and clears both cache entries', async () => {
      const result = await bookService.editBook(t, 5, { price: 150 });

      expect(bookRepo.updateBook).toHaveBeenCalledWith(5, { price: 150 });
      expect(redisClient.del).toHaveBeenCalledWith(['books:all', 'books:5']);
      expect(result).toEqual({ success: true, status: 200, message: 'book.updated' });
    });

    it('returns 404 when the book to update does not exist', async () => {
      const notFoundError = new Error('no record found');
      notFoundError.code = 'P2025';
      bookRepo.updateBook.mockRejectedValue(notFoundError);

      const result = await bookService.editBook(t, 999, { price: 150 });

      expect(result).toEqual({ success: false, status: 404, message: 'book.notFound' });
    });

    it('returns a plain 500 for unrelated errors', async () => {
      bookRepo.updateBook.mockRejectedValue(new Error('db down'));

      const result = await bookService.editBook(t, 5, { price: 150 });

      expect(result).toEqual({ success: false, status: 500, message: 'book.updateError' });
    });

    it('still succeeds when Redis fails to invalidate the cache (soft failure, not fatal)', async () => {
      redisClient.del.mockRejectedValue(new Error('redis down'));

      const result = await bookService.editBook(t, 5, { price: 150 });

      expect(result).toEqual({ success: true, status: 200, message: 'book.updated' });
    });
  });

  describe('getPopularBooks', () => {
    it('caps the limit at 50 even when a larger value is requested', async () => {
      bookRepo.getPopularBooks.mockResolvedValue([]);

      await bookService.getPopularBooks(t, 500);

      expect(bookRepo.getPopularBooks).toHaveBeenCalledWith(50);
    });

    it('falls back to the default limit of 10 for an invalid value', async () => {
      bookRepo.getPopularBooks.mockResolvedValue([]);

      await bookService.getPopularBooks(t, 'not-a-number');

      expect(bookRepo.getPopularBooks).toHaveBeenCalledWith(10);
    });

    it('returns the serialized list of popular books', async () => {
      bookRepo.getPopularBooks.mockResolvedValue([makeBook()]);

      const result = await bookService.getPopularBooks(t, 5);

      expect(result.data.users[0]).toMatchObject({ id: 1, name: 'Book' });
    });
  });
});