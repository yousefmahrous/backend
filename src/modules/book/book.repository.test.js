import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
  book: { create: vi.fn(), update: vi.fn() },
  productVariant: { create: vi.fn(), updateMany: vi.fn() },
};

vi.mock('../../core/db.js', () => ({
  default: {
    $transaction: vi.fn((cb) => cb(tx)),
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
    prisma.$transaction.mockImplementation((cb) => cb(tx));
    tx.book.create.mockResolvedValue({ id: 1 });
    vendorRepo.getPlatformVendorId.mockResolvedValue(1);
  });

  it("assigns the book to the store's own vendor when no vendor is given", async () => {
    await bookRepo.createBook(bookData);

    expect(vendorRepo.getPlatformVendorId).toHaveBeenCalledTimes(1);
    expect(tx.book.create.mock.calls[0][0].data.vendor_id).toBe(1);
  });

  it('uses the given vendor id and does not look up the platform vendor', async () => {
    await bookRepo.createBook(bookData, 42);

    expect(vendorRepo.getPlatformVendorId).not.toHaveBeenCalled();
    expect(tx.book.create.mock.calls[0][0].data.vendor_id).toBe(42);
  });

  it('still maps the legacy field names onto the book columns', async () => {
    await bookRepo.createBook(bookData, 42);

    const { data } = tx.book.create.mock.calls[0][0];
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

    const { data } = tx.book.create.mock.calls[0][0];
    expect(data.category).toBe('novels');
    expect(data.category_id).toBe(4);
  });

  it('creates exactly one variant for the new book, carrying over its price, stock and ISBN', async () => {
    tx.book.create.mockResolvedValue({ id: 9 });

    await bookRepo.createBook(bookData, 42);

    expect(tx.productVariant.create).toHaveBeenCalledWith({
      data: { product_id: 9, barcode: bookData.number, price: 25000, stock: 5 },
    });
  });

  it('does not create the book when the platform vendor is missing', async () => {
    vendorRepo.getPlatformVendorId.mockRejectedValue(new Error('PLATFORM_VENDOR_MISSING'));

    await expect(bookRepo.createBook(bookData)).rejects.toThrow('PLATFORM_VENDOR_MISSING');
    expect(tx.book.create).not.toHaveBeenCalled();
  });

  it('creates nothing at all when the transaction fails partway through', async () => {
    tx.book.create.mockResolvedValue({ id: 9 });
    tx.productVariant.create.mockRejectedValue(new Error('db down'));

    await expect(bookRepo.createBook(bookData, 42)).rejects.toThrow('db down');
  });
});

describe('book.repository updateBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
    tx.book.update.mockResolvedValue({ id: 5 });
  });

  it('updates the book and keeps its single variant in sync with the new price and stock', async () => {
    await bookRepo.updateBook(5, { name: 'x', adress: 'y', email: 'z', stock: 20, price: 5000 });

    expect(tx.book.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { title: 'x', description: 'y', publisher_email: 'z', stock: 20, price: 5000 },
    });
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { product_id: 5 },
      data: { stock: 20, price: 5000 },
    });
  });

  it('rolls back with nothing applied when the variant update fails', async () => {
    tx.productVariant.updateMany.mockRejectedValue(new Error('db down'));

    await expect(bookRepo.updateBook(5, { stock: 20, price: 5000 })).rejects.toThrow('db down');
  });
});