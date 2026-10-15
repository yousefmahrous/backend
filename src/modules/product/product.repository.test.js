import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
  product: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  productVariant: { createMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
const productRepo = await import('./product.repository.js');

const productData = {
  name: { ar: 'كتاب', en: 'Product' },
  number: '9780060883287',
  email: 'pub@example.com',
  adress: { ar: 'وصف', en: 'desc' },
  centre: 'Harper',
  category: 'novels',
  stock: 5,
  price: 25000,
  avatar_key: null,
};

describe('product.repository createProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
    tx.product.create.mockResolvedValue({ id: 1 });
    vendorRepo.getPlatformVendorId.mockResolvedValue(1);
  });

  it("assigns the product to the store's own vendor when no vendor is given", async () => {
    await productRepo.createProduct(productData);

    expect(vendorRepo.getPlatformVendorId).toHaveBeenCalledTimes(1);
    expect(tx.product.create.mock.calls[0][0].data.vendor_id).toBe(1);
  });

  it('uses the given vendor id and does not look up the platform vendor', async () => {
    await productRepo.createProduct(productData, 42);

    expect(vendorRepo.getPlatformVendorId).not.toHaveBeenCalled();
    expect(tx.product.create.mock.calls[0][0].data.vendor_id).toBe(42);
  });

  it('still maps the legacy field names onto the product columns', async () => {
    await productRepo.createProduct(productData, 42);

    const { data } = tx.product.create.mock.calls[0][0];
    expect(data).toMatchObject({
      title: productData.name,
      isbn: productData.number,
      publisher_email: productData.email,
      description: productData.adress,
      publisher: productData.centre,
      category: 'novels',
      stock: 5,
      price: 25000,
      cover_key: null,
      cover_url: null,
    });
  });

  it('stores the category id next to the old category text', async () => {
    await productRepo.createProduct({ ...productData, category_id: 4 }, 42);

    const { data } = tx.product.create.mock.calls[0][0];
    expect(data.category).toBe('novels');
    expect(data.category_id).toBe(4);
  });

  it('creates exactly one variant for the new product, carrying over its price, stock and ISBN', async () => {
    tx.product.create.mockResolvedValue({ id: 9 });

    await productRepo.createProduct(productData, 42);

    expect(tx.productVariant.createMany).toHaveBeenCalledWith({
      data: [{ product_id: 9, sku: null, barcode: productData.number, options: {}, price: 25000, stock: 5 }],
    });
  });

  it('creates one variant per entry when several variants are given, with no barcode on any of them', async () => {
    tx.product.create.mockResolvedValue({ id: 20 });
    const variants = [
      { sku: 'S-RED', options: { size: 'S', color: 'red' }, price: 100, stock: 3 },
      { sku: 'M-RED', options: { size: 'M', color: 'red' }, price: 120, stock: 4 },
    ];

    await productRepo.createProduct({ ...productData, variants }, 42);

    expect(tx.productVariant.createMany).toHaveBeenCalledWith({
      data: [
        { product_id: 20, sku: 'S-RED', barcode: null, options: { size: 'S', color: 'red' }, price: 100, stock: 3 },
        { product_id: 20, sku: 'M-RED', barcode: null, options: { size: 'M', color: 'red' }, price: 120, stock: 4 },
      ],
    });
  });

  it('creates a product with no ISBN, publisher or publisher email and gives its variant a null barcode', async () => {
    tx.product.create.mockResolvedValue({ id: 11 });
    const { number, email, centre, ...productWithoutOptional } = productData;

    await productRepo.createProduct(productWithoutOptional, 42);

    const { data } = tx.product.create.mock.calls[0][0];
    expect(data.isbn).toBeNull();
    expect(data.publisher_email).toBeNull();
    expect(data.publisher).toBeNull();
    expect(tx.productVariant.createMany).toHaveBeenCalledWith({
      data: [{ product_id: 11, sku: null, barcode: null, options: {}, price: 25000, stock: 5 }],
    });
  });

  it('also stores nulls when the product-only fields come through as explicit nulls', async () => {
    tx.product.create.mockResolvedValue({ id: 12 });

    await productRepo.createProduct({ ...productData, number: null, email: null, centre: null }, 42);

    const { data } = tx.product.create.mock.calls[0][0];
    expect(data).toMatchObject({ isbn: null, publisher_email: null, publisher: null });
    expect(tx.productVariant.createMany.mock.calls[0][0].data[0].barcode).toBeNull();
  });

  it('does not create the product when the platform vendor is missing', async () => {
    vendorRepo.getPlatformVendorId.mockRejectedValue(new Error('PLATFORM_VENDOR_MISSING'));

    await expect(productRepo.createProduct(productData)).rejects.toThrow('PLATFORM_VENDOR_MISSING');
    expect(tx.product.create).not.toHaveBeenCalled();
  });

  it('creates nothing at all when the transaction fails partway through', async () => {
    tx.product.create.mockResolvedValue({ id: 9 });
    tx.productVariant.createMany.mockRejectedValue(new Error('db down'));

    await expect(productRepo.createProduct(productData, 42)).rejects.toThrow('db down');
  });
});

describe('product.repository updateProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
    tx.product.update.mockResolvedValue({ id: 5 });
    tx.productVariant.findMany.mockResolvedValue([{ id: 7 }]);
    tx.productVariant.findFirst.mockResolvedValue({ id: 7, price: 5000, stock: 20 });
  });

  it('updates the product and keeps its single variant in sync with the new price and stock', async () => {
    await productRepo.updateProduct(5, { name: 'x', adress: 'y', email: 'z', stock: 20, price: 5000 });

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { title: 'x', description: 'y', publisher_email: 'z' },
    });
    expect(tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { stock: 20, price: 5000 },
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { price: 5000, stock: 20 },
    });
  });

  it('does not touch price/stock when the product has several variants', async () => {
    tx.productVariant.findMany.mockResolvedValue([{ id: 7 }, { id: 8 }]);

    await productRepo.updateProduct(5, { name: 'x', stock: 20, price: 5000 });

    expect(tx.productVariant.update).not.toHaveBeenCalled();
  });

  it('rolls back with nothing applied when the variant update fails', async () => {
    tx.productVariant.update.mockRejectedValueOnce(new Error('db down'));

    await expect(productRepo.updateProduct(5, { stock: 20, price: 5000 })).rejects.toThrow('db down');
  });
});

describe('product.repository vendor-scoped ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
    tx.productVariant.findMany.mockResolvedValue([{ id: 7 }]);
    tx.productVariant.findFirst.mockResolvedValue({ id: 7, price: 100, stock: 9 });
    tx.product.update.mockResolvedValue({ id: 1 });
  });

  it('updateVendorProduct: scopes the update to (id AND vendor_id), refusing to touch another vendor\'s product', async () => {
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    const result = await productRepo.updateVendorProduct(5, 1, { stock: 1, price: 1 });

    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, vendor_id: 5 } })
    );
    expect(result).toBeNull();
    expect(tx.productVariant.update).not.toHaveBeenCalled();
  });

  it('updateVendorProduct: updates the variant too when the product belongs to this vendor', async () => {
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.product.findUnique.mockResolvedValue({ id: 1 });

    const result = await productRepo.updateVendorProduct(5, 1, { stock: 9, price: 100 });

    expect(tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { stock: 9, price: 100 },
    });
    expect(result).toEqual({ id: 1 });
  });
});

describe('product.repository deleteVendorProduct', () => {
  it("scopes the delete to (id AND vendor_id), returning false for another vendor's product", async () => {
    prisma.product = prisma.product || {};
    prisma.product.deleteMany = vi.fn().mockResolvedValue({ count: 0 });

    const result = await productRepo.deleteVendorProduct(5, 1);

    expect(prisma.product.deleteMany).toHaveBeenCalledWith({ where: { id: 1, vendor_id: 5 } });
    expect(result).toBe(false);
  });
});