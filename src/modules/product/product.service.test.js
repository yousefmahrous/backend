import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./product.repository.js', () => ({
  getAllProducts: vi.fn(),
  getProductById: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  updateProduct: vi.fn(),
  getPopularProducts: vi.fn(),
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

const productRepo = await import('./product.repository.js');
const categoryRepo = await import('../category/category.repository.js');
const redisClient = (await import('../../core/config/redis.client.js')).default;
const productService = await import('./product.service.js');

const t = fakeT;

const makeProduct = (overrides = {}) => ({
  id: 1,
  title: 'Product',
  isbn: '123',
  publisher_email: 'p@x.com',
  description: 'desc',
  publisher: 'Pub',
  category: 'fiction',
  price: 999,
  stock: 999,
  cover_url: 'http://x/cover.jpg',
  cover_key: 'cover-key',
  status: 'published',
  vendor: { status: 'active' },
  variants: [{ id: 10, price: 100, stock: 5 }],
  ...overrides,
});

describe('product.service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEmit.mockClear();
    redisClient.get.mockResolvedValue(null);
    redisClient.del.mockResolvedValue(undefined);
    categoryRepo.findCategoryBySlug.mockResolvedValue({ id: 3, slug: 'novels' });
  });

  describe('getAllProducts', () => {
    it('paginates with sane defaults and serializes each product', async () => {
      productRepo.getAllProducts.mockResolvedValue({ products: [makeProduct()], totalCount: 1 });

      const result = await productService.getAllProducts(t);

      expect(productRepo.getAllProducts).toHaveBeenCalledWith(0, 10, '', '');
      expect(result.data.users[0]).toMatchObject({ id: 1, name: 'Product', price: 100, stock: 5 });
      expect(result.data.pagination).toMatchObject({ totalCount: 1, totalPages: 1, currentPage: 1 });
    });

    it('serializes a non-product product with missing ISBN/publisher as nulls, not undefined or "null" text', async () => {
      const product = makeProduct({ isbn: null, publisher_email: null, publisher: null });
      productRepo.getAllProducts.mockResolvedValue({ products: [product], totalCount: 1 });

      const result = await productService.getAllProducts(t);

      expect(result.data.users[0]).toMatchObject({ number: null, email: null, centre: null });
    });

    it("reads price/stock from the variant, not the stale product columns", async () => {
      productRepo.getAllProducts.mockResolvedValue({
        products: [makeProduct({ price: 777, stock: 777, variants: [{ id: 10, price: 100, stock: 5 }] })],
        totalCount: 1,
      });

      const result = await productService.getAllProducts(t);

      expect(result.data.users[0].price).toBe(100);
      expect(result.data.users[0].stock).toBe(5);
    });

    it('falls back to the product columns when a product somehow has no variant', async () => {
      productRepo.getAllProducts.mockResolvedValue({
        products: [makeProduct({ price: 777, stock: 777, variants: [] })],
        totalCount: 1,
      });

      const result = await productService.getAllProducts(t);

      expect(result.data.users[0].price).toBe(777);
      expect(result.data.users[0].stock).toBe(777);
    });

    it('computes skip correctly for later pages and forwards search/category filters', async () => {
      productRepo.getAllProducts.mockResolvedValue({ products: [], totalCount: 0 });

      await productService.getAllProducts(t, 3, 20, 'harry', 'fiction');

      expect(productRepo.getAllProducts).toHaveBeenCalledWith(40, 20, 'harry', 'fiction');
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      productRepo.getAllProducts.mockRejectedValue(new Error('db down'));

      const result = await productService.getAllProducts(t);

      expect(result).toEqual({ success: false, status: 500, message: 'common.serverError' });
    });
  });

  describe('getProductById', () => {
    it('returns the cached product without touching the repository on a cache hit', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify({ id: 1, name: 'Cached' }));

      const result = await productService.getProductById(t, 1);

      expect(result).toEqual({ success: true, status: 200, data: { user: { id: 1, name: 'Cached' } } });
      expect(productRepo.getProductById).not.toHaveBeenCalled();
    });

    it('returns 404 when the product does not exist (and does not cache anything)', async () => {
      productRepo.getProductById.mockResolvedValue(null);

      const result = await productService.getProductById(t, 999);

      expect(result).toEqual({ success: false, status: 404, message: 'product.notFound' });
      expect(redisClient.set).not.toHaveBeenCalled();
    });

    it('fetches from the repository on a cache miss and caches the serialized result', async () => {
      productRepo.getProductById.mockResolvedValue(makeProduct({ vendor: { status: 'active' } }));

      const result = await productService.getProductById(t, 1);

      expect(redisClient.set).toHaveBeenCalledWith(
        'products:1',
        expect.stringContaining('"id":1'),
        { EX: 3600 }
      );
      expect(result).toMatchObject({ success: true, status: 200, data: { user: { id: 1, name: 'Product' } } });
    });

    it('hides an unpublished product from a regular visitor (returns 404, no leak)', async () => {
      productRepo.getProductById.mockResolvedValue(makeProduct({ status: 'draft', vendor: { status: 'active' } }));

      const result = await productService.getProductById(t, 1);

      expect(result).toEqual({ success: false, status: 404, message: 'product.notFound' });
      expect(redisClient.set).not.toHaveBeenCalled();
    });

    it("hides a product whose vendor is suspended from a regular visitor", async () => {
      productRepo.getProductById.mockResolvedValue(makeProduct({ status: 'published', vendor: { status: 'suspended' } }));

      const result = await productService.getProductById(t, 1);

      expect(result).toEqual({ success: false, status: 404, message: 'product.notFound' });
    });

    it('lets an admin see a hidden product, uncached, without the visibility check', async () => {
      productRepo.getProductById.mockResolvedValue(makeProduct({ status: 'draft', vendor: { status: 'suspended' } }));

      const result = await productService.getProductById(t, 1, true);

      expect(result).toMatchObject({ success: true, status: 200, data: { user: { id: 1 } } });
      expect(redisClient.get).not.toHaveBeenCalled();
      expect(redisClient.set).not.toHaveBeenCalled();
    });
  });

  describe('addProduct', () => {
    it('creates the product, invalidates the "all products" cache, and notifies over the socket', async () => {
      const result = await productService.addProduct(t, { title: 'New', category: 'novels' });

      expect(productRepo.createProduct).toHaveBeenCalledWith({ title: 'New', category: 'novels', category_id: 3 });
      expect(redisClient.del).toHaveBeenCalledWith('products:all');
      expect(mockEmit).toHaveBeenCalledWith('products_updated');
      expect(result).toEqual({ success: true, status: 201, message: 'product.added' });
    });

    it('creates a product that has no ISBN, publisher or publisher email', async () => {
      const result = await productService.addProduct(t, { name: 'Lamp', number: null, email: null, centre: null, category: 'novels' });

      expect(productRepo.createProduct).toHaveBeenCalledWith({
        name: 'Lamp',
        number: null,
        email: null,
        centre: null,
        category: 'novels',
        category_id: 3,
      });
      expect(result).toEqual({ success: true, status: 201, message: 'product.added' });
    });

    it('looks the category up by its slug and links the product to it by id', async () => {
      categoryRepo.findCategoryBySlug.mockResolvedValue({ id: 8, slug: 'kids' });

      await productService.addProduct(t, { title: 'New', category: 'kids' });

      expect(categoryRepo.findCategoryBySlug).toHaveBeenCalledWith('kids');
      expect(productRepo.createProduct.mock.calls[0][0].category_id).toBe(8);
    });

    it('rejects an unknown category with a 400 on the category field and creates nothing', async () => {
      categoryRepo.findCategoryBySlug.mockResolvedValue(null);

      const result = await productService.addProduct(t, { title: 'New', category: 'hacked' });

      expect(result).toEqual({
        success: false,
        status: 400,
        errors: { category: ['product.validation.categoryInvalid'] },
      });
      expect(productRepo.createProduct).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      productRepo.createProduct.mockRejectedValue(new Error('db down'));

      const result = await productService.addProduct(t, { title: 'New', category: 'novels' });

      expect(result).toEqual({ success: false, status: 500, message: 'product.addError' });
    });

    it('still succeeds when Redis fails to invalidate the cache (soft failure, not fatal)', async () => {
      redisClient.del.mockRejectedValue(new Error('redis down'));

      const result = await productService.addProduct(t, { title: 'New', category: 'novels' });

      expect(result).toEqual({ success: true, status: 201, message: 'product.added' });
    });
  });

  describe('deleteProduct', () => {
    it('deletes the product and clears both cache entries', async () => {
      const result = await productService.deleteProduct(t, 5);

      expect(productRepo.deleteProduct).toHaveBeenCalledWith(5);
      expect(redisClient.del).toHaveBeenCalledWith(['products:all', 'products:5']);
      expect(result).toEqual({ success: true, status: 200, message: 'product.deleted' });
    });

    it('returns 409 when the product is still referenced elsewhere (foreign key constraint)', async () => {
      const fkError = new Error('foreign key constraint failed');
      fkError.code = 'P2003';
      productRepo.deleteProduct.mockRejectedValue(fkError);

      const result = await productService.deleteProduct(t, 5);

      expect(result).toEqual({ success: false, status: 409, message: 'product.deleteForeignKey' });
    });

    it('returns a plain 500 for unrelated errors', async () => {
      productRepo.deleteProduct.mockRejectedValue(new Error('db down'));

      const result = await productService.deleteProduct(t, 5);

      expect(result).toEqual({ success: false, status: 500, message: 'product.deleteError' });
    });
  });

  describe('editProduct', () => {
    it('updates the product and clears both cache entries', async () => {
      const result = await productService.editProduct(t, 5, { price: 150 });

      expect(productRepo.updateProduct).toHaveBeenCalledWith(5, { price: 150 });
      expect(redisClient.del).toHaveBeenCalledWith(['products:all', 'products:5']);
      expect(result).toEqual({ success: true, status: 200, message: 'product.updated' });
    });

    it('returns 404 when the product to update does not exist', async () => {
      const notFoundError = new Error('no record found');
      notFoundError.code = 'P2025';
      productRepo.updateProduct.mockRejectedValue(notFoundError);

      const result = await productService.editProduct(t, 999, { price: 150 });

      expect(result).toEqual({ success: false, status: 404, message: 'product.notFound' });
    });

    it('returns a plain 500 for unrelated errors', async () => {
      productRepo.updateProduct.mockRejectedValue(new Error('db down'));

      const result = await productService.editProduct(t, 5, { price: 150 });

      expect(result).toEqual({ success: false, status: 500, message: 'product.updateError' });
    });

    it('still succeeds when Redis fails to invalidate the cache (soft failure, not fatal)', async () => {
      redisClient.del.mockRejectedValue(new Error('redis down'));

      const result = await productService.editProduct(t, 5, { price: 150 });

      expect(result).toEqual({ success: true, status: 200, message: 'product.updated' });
    });
  });

  describe('getPopularProducts', () => {
    it('caps the limit at 50 even when a larger value is requested', async () => {
      productRepo.getPopularProducts.mockResolvedValue([]);

      await productService.getPopularProducts(t, 500);

      expect(productRepo.getPopularProducts).toHaveBeenCalledWith(50);
    });

    it('falls back to the default limit of 10 for an invalid value', async () => {
      productRepo.getPopularProducts.mockResolvedValue([]);

      await productService.getPopularProducts(t, 'not-a-number');

      expect(productRepo.getPopularProducts).toHaveBeenCalledWith(10);
    });

    it('returns the serialized list of popular products', async () => {
      productRepo.getPopularProducts.mockResolvedValue([makeProduct()]);

      const result = await productService.getPopularProducts(t, 5);

      expect(result.data.users[0]).toMatchObject({ id: 1, name: 'Product' });
    });
  });
});