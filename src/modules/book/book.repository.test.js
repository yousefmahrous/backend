import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/db.js', () => ({
  default: {
    book: { create: vi.fn() },
  },
}));

vi.mock('../vendor/vendor.repository.js', () => ({
  getPlatformVendorId: vi.fn(),
}));

const prisma = (await import('../../core/db.js')).default;
const vendorRepo = await import('../vendor/vendor.repository.js');
const bookRepo = await import('./book.repository.js');

const bookData = {
  name: { ar: 'كتاب', en: 'Book' },
  number: '9780060883287',
  email: 'pub@example.com',
  adress: { ar: 'وصف', en: 'desc' },
  centre: 'Harper',
  category: 'novels',
  stock: 5,
  price: 25000,
  avatar_key: null,
};

describe('book.repository createBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.book.create.mockResolvedValue({ id: 1 });
    vendorRepo.getPlatformVendorId.mockResolvedValue(1);
  });

  it("assigns the book to the store's own vendor when no vendor is given", async () => {
    await bookRepo.createBook(bookData);

    expect(vendorRepo.getPlatformVendorId).toHaveBeenCalledTimes(1);
    expect(prisma.book.create.mock.calls[0][0].data.vendor_id).toBe(1);
  });

  it('uses the given vendor id and does not look up the platform vendor', async () => {
    await bookRepo.createBook(bookData, 42);

    expect(vendorRepo.getPlatformVendorId).not.toHaveBeenCalled();
    expect(prisma.book.create.mock.calls[0][0].data.vendor_id).toBe(42);
  });

  it('still maps the legacy field names onto the book columns', async () => {
    await bookRepo.createBook(bookData, 42);

    const { data } = prisma.book.create.mock.calls[0][0];
    expect(data).toMatchObject({
      title: bookData.name,
      isbn: bookData.number,
      publisher_email: bookData.email,
      description: bookData.adress,
      publisher: bookData.centre,
      category: 'novels',
      stock: 5,
      price: 25000,
      cover_key: null,
      cover_url: null,
    });
  });

  it('stores the category id next to the old category text', async () => {
    await bookRepo.createBook({ ...bookData, category_id: 4 }, 42);

    const { data } = prisma.book.create.mock.calls[0][0];
    expect(data.category).toBe('novels');
    expect(data.category_id).toBe(4);
  });

  it('does not create the book when the platform vendor is missing', async () => {
    vendorRepo.getPlatformVendorId.mockRejectedValue(new Error('PLATFORM_VENDOR_MISSING'));

    await expect(bookRepo.createBook(bookData)).rejects.toThrow('PLATFORM_VENDOR_MISSING');
    expect(prisma.book.create).not.toHaveBeenCalled();
  });
});