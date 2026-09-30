import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('../book/book.repository.js', () => ({
  getBooksByVendor: vi.fn(),
  getVendorBookById: vi.fn(),
  createBook: vi.fn(),
  updateVendorBook: vi.fn(),
  deleteVendorBook: vi.fn(),
}));
vi.mock('../category/category.repository.js', () => ({ findCategoryBySlug: vi.fn() }));
vi.mock('../book/book.service.js', () => ({
  serializeBook: (b) => ({ id: b.id, name: b.title }),
}));
const mockEmit = vi.fn();
vi.mock('../../core/config/socket.config.js', () => ({ getIO: () => ({ emit: mockEmit }) }));
vi.mock('../../core/config/redis.client.js', () => ({ default: { del: vi.fn() } }));

const bookRepo = await import('../book/book.repository.js');
const categoryRepo = await import('../category/category.repository.js');
const svc = await import('./vendor.book.service.js');
const t = fakeT;

describe('vendor.book.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getMyBooks: lists only the vendor own books, paginated', async () => {
    bookRepo.getBooksByVendor.mockResolvedValue({ books: [{ id: 1, title: 'A' }], totalCount: 1 });

    const result = await svc.getMyBooks(t, 5, 1, 10);

    expect(bookRepo.getBooksByVendor).toHaveBeenCalledWith(5, 0, 10);
    expect(result.data.users[0]).toEqual({ id: 1, name: 'A' });
  });

  it('getMyBookById: 404 when the book is not theirs (repo returns null)', async () => {
    bookRepo.getVendorBookById.mockResolvedValue(null);

    const result = await svc.getMyBookById(t, 5, 99);

    expect(result).toEqual({ success: false, status: 404, message: 'book.notFound' });
  });

  it('addMyBook: creates the book under the vendor own id', async () => {
    categoryRepo.findCategoryBySlug.mockResolvedValue({ id: 3 });

    await svc.addMyBook(t, 5, { category: 'novels', name: 'x' });

    expect(bookRepo.createBook).toHaveBeenCalledWith({ category: 'novels', name: 'x', category_id: 3 }, 5);
  });

  it('addMyBook: 400 on unknown category, creates nothing', async () => {
    categoryRepo.findCategoryBySlug.mockResolvedValue(null);

    const result = await svc.addMyBook(t, 5, { category: 'x' });

    expect(result.status).toBe(400);
    expect(bookRepo.createBook).not.toHaveBeenCalled();
  });

  it("editMyBook: 404 when the book id does not belong to this vendor (does not leak)", async () => {
    bookRepo.updateVendorBook.mockResolvedValue(null);

    const result = await svc.editMyBook(t, 5, 99, { price: 1 });

    expect(result).toEqual({ success: false, status: 404, message: 'book.notFound' });
  });

  it('editMyBook: updates when owned', async () => {
    bookRepo.updateVendorBook.mockResolvedValue({ id: 1 });

    const result = await svc.editMyBook(t, 5, 1, { price: 1 });

    expect(bookRepo.updateVendorBook).toHaveBeenCalledWith(5, 1, { price: 1 });
    expect(result.status).toBe(200);
  });

  it("deleteMyBook: 404 when not owned, does not throw", async () => {
    bookRepo.deleteVendorBook.mockResolvedValue(false);

    const result = await svc.deleteMyBook(t, 5, 99);

    expect(result).toEqual({ success: false, status: 404, message: 'book.notFound' });
  });

  it('deleteMyBook: 409 on foreign key violation', async () => {
    const err = new Error('foreign key constraint');
    err.code = 'P2003';
    bookRepo.deleteVendorBook.mockRejectedValue(err);

    const result = await svc.deleteMyBook(t, 5, 1);

    expect(result.status).toBe(409);
  });
});