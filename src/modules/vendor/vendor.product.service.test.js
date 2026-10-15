import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('../product/product.repository.js', () => ({
  getProductsByVendor: vi.fn(),
  getVendorProductById: vi.fn(),
  createProduct: vi.fn(),
  updateVendorProduct: vi.fn(),
  deleteVendorProduct: vi.fn(),
}));
vi.mock('../category/category.repository.js', () => ({ findCategoryBySlug: vi.fn() }));
vi.mock('../product/product.service.js', () => ({
  serializeProduct: (b) => ({ id: b.id, name: b.title }),
}));
const mockEmit = vi.fn();
vi.mock('../../core/config/socket.config.js', () => ({ getIO: () => ({ emit: mockEmit }) }));
vi.mock('../../core/config/redis.client.js', () => ({ default: { del: vi.fn() } }));

const productRepo = await import('../product/product.repository.js');
const categoryRepo = await import('../category/category.repository.js');
const svc = await import('./vendor.product.service.js');
const t = fakeT;

describe('vendor.product.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getMyProducts: lists only the vendor own products, paginated', async () => {
    productRepo.getProductsByVendor.mockResolvedValue({ products: [{ id: 1, title: 'A' }], totalCount: 1 });

    const result = await svc.getMyProducts(t, 5, 1, 10);

    expect(productRepo.getProductsByVendor).toHaveBeenCalledWith(5, 0, 10);
    expect(result.data.users[0]).toEqual({ id: 1, name: 'A' });
  });

  it('getMyProductById: 404 when the product is not theirs (repo returns null)', async () => {
    productRepo.getVendorProductById.mockResolvedValue(null);

    const result = await svc.getMyProductById(t, 5, 99);

    expect(result).toEqual({ success: false, status: 404, message: 'product.notFound' });
  });

  it('addMyProduct: creates the product under the vendor own id', async () => {
    categoryRepo.findCategoryBySlug.mockResolvedValue({ id: 3 });

    await svc.addMyProduct(t, 5, { category: 'novels', name: 'x' });

    expect(productRepo.createProduct).toHaveBeenCalledWith({ category: 'novels', name: 'x', category_id: 3 }, 5);
  });

  it('addMyProduct: 400 on unknown category, creates nothing', async () => {
    categoryRepo.findCategoryBySlug.mockResolvedValue(null);

    const result = await svc.addMyProduct(t, 5, { category: 'x' });

    expect(result.status).toBe(400);
    expect(productRepo.createProduct).not.toHaveBeenCalled();
  });

  it("editMyProduct: 404 when the product id does not belong to this vendor (does not leak)", async () => {
    productRepo.updateVendorProduct.mockResolvedValue(null);

    const result = await svc.editMyProduct(t, 5, 99, { price: 1 });

    expect(result).toEqual({ success: false, status: 404, message: 'product.notFound' });
  });

  it('editMyProduct: updates when owned', async () => {
    productRepo.updateVendorProduct.mockResolvedValue({ id: 1 });

    const result = await svc.editMyProduct(t, 5, 1, { price: 1 });

    expect(productRepo.updateVendorProduct).toHaveBeenCalledWith(5, 1, { price: 1 });
    expect(result.status).toBe(200);
  });

  it("deleteMyProduct: 404 when not owned, does not throw", async () => {
    productRepo.deleteVendorProduct.mockResolvedValue(false);

    const result = await svc.deleteMyProduct(t, 5, 99);

    expect(result).toEqual({ success: false, status: 404, message: 'product.notFound' });
  });

  it('deleteMyProduct: 409 on foreign key violation', async () => {
    const err = new Error('foreign key constraint');
    err.code = 'P2003';
    productRepo.deleteVendorProduct.mockRejectedValue(err);

    const result = await svc.deleteMyProduct(t, 5, 1);

    expect(result.status).toBe(409);
  });
});