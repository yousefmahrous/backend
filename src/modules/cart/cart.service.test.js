import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./cart.repository.js', () => ({
  getOrCreateCart: vi.fn(),
  reserveAndAddItem: vi.fn(),
  reserveAndUpdateQuantity: vi.fn(),
  releaseAndRemoveItem: vi.fn(),
  findCartItem: vi.fn(),
  findCartItemByVariant: vi.fn(),
  updateItemQuantity: vi.fn(),
  removeItem: vi.fn(),
  clearCart: vi.fn(),
  getVariantsByProductId: vi.fn(),
  getVariantById: vi.fn(),
}));

vi.mock('../payment/payment.service.js', () => ({
  expireStalePendingOrders: vi.fn(),
}));

const mockEmit = vi.fn();
vi.mock('../../core/config/socket.config.js', () => ({
  getIO: vi.fn(() => ({ emit: mockEmit })),
}));

vi.mock('../../core/config/redis.client.js', () => ({
  default: { del: vi.fn() },
}));

const cartRepo = await import('./cart.repository.js');
const paymentService = await import('../payment/payment.service.js');
const redisClient = (await import('../../core/config/redis.client.js')).default;
const cartService = await import('./cart.service.js');

const t = fakeT;

const makeCart = (overrides = {}) => ({
  id: 1,
  items: [
    {
      id: 1,
      quantity: 2,
      variant: {
        id: 10,
        stock: 5,
        price: 100,
        product: { id: 1, title: 'Product', isbn: '123', category: 'fiction', cover_url: 'http://x/c.jpg' },
      },
    },
  ],
  ...overrides,
});

describe('cart.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmit.mockClear();
    redisClient.del.mockResolvedValue(undefined);
  });

  describe('getCart', () => {
    it('expires stale pending orders before loading the cart', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());

      const result = await cartService.getCart(t, 5);

      expect(paymentService.expireStalePendingOrders).toHaveBeenCalledWith(5);
      expect(result.data).toMatchObject({ id: 1, itemsCount: 2 });
      expect(result.data.items[0].product).toMatchObject({ id: 1, name: 'Product', stock: 5, price: 100 });
    });

    it('returns a 500 when loading the cart fails unexpectedly', async () => {
      cartRepo.getOrCreateCart.mockRejectedValue(new Error('db down'));

      const result = await cartService.getCart(t, 5);

      expect(result).toEqual({ success: false, status: 500, message: 'cart.loadError' });
    });
  });

  describe('addToCart', () => {
    it('returns 404 when the product has no variant (does not exist)', async () => {
      cartRepo.getVariantsByProductId.mockResolvedValue([]);

      const result = await cartService.addToCart(t, 5, 999);

      expect(result).toEqual({ success: false, status: 404, message: 'cart.productNotFound' });
      expect(cartRepo.reserveAndAddItem).not.toHaveBeenCalled();
    });

    it("refuses to add the vendor's own product and reserves nothing", async () => {
      cartRepo.getVariantsByProductId.mockResolvedValue([{
        id: 10,
        product_id: 1,
        stock: 5,
        product: { id: 1, vendor: { owner_id: 5 } },
      }]);

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toEqual({ success: false, status: 403, message: 'cart.ownProduct' });
      expect(cartRepo.reserveAndAddItem).not.toHaveBeenCalled();
    });

    it("still lets a different user add that vendor's product", async () => {
      cartRepo.getVariantsByProductId.mockResolvedValue([{
        id: 10,
        product_id: 1,
        stock: 5,
        product: { id: 1, vendor: { owner_id: 99 } },
      }]);
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockResolvedValue(undefined);

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toMatchObject({ success: true, status: 201 });
    });

    it('returns 400 without crashing when the reservation fails due to out-of-stock', async () => {
      cartRepo.getVariantsByProductId.mockResolvedValue([{ id: 10, product_id: 1, stock: 0 }]);
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockRejectedValue(new Error('OUT_OF_STOCK'));

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toEqual({ success: false, status: 400, message: 'cart.outOfStock' });
    });

    it('resolves the product to its variant and reserves that variant, not the product id', async () => {
      cartRepo.getVariantsByProductId.mockResolvedValue([{ id: 10, product_id: 1, stock: 5 }]);
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockResolvedValue(undefined);

      const result = await cartService.addToCart(t, 5, 1);

      expect(cartRepo.getVariantsByProductId).toHaveBeenCalledWith(1);
      expect(cartRepo.reserveAndAddItem).toHaveBeenCalledWith(1, 10, 1);
      expect(redisClient.del).toHaveBeenCalledWith(['products:all', 'products:1']);
      expect(mockEmit).toHaveBeenCalledWith('products_updated');
      expect(result).toMatchObject({ success: true, status: 201, message: 'cart.addSuccess' });
    });

    it('propagates unexpected reservation errors as a 500', async () => {
      cartRepo.getVariantsByProductId.mockResolvedValue([{ id: 10, product_id: 1, stock: 5 }]);
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockRejectedValue(new Error('something else'));

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toEqual({ success: false, status: 500, message: 'cart.addError' });
    });

    it('still succeeds when Redis fails to invalidate the cache (soft failure, not fatal)', async () => {
      cartRepo.getVariantsByProductId.mockResolvedValue([{ id: 10, product_id: 1, stock: 5 }]);
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockResolvedValue(undefined);
      redisClient.del.mockRejectedValue(new Error('redis down'));

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toMatchObject({ success: true, status: 201 });
    });
    it('returns 400 when the product has several variants and none was chosen', async () => {
      cartRepo.getVariantsByProductId.mockResolvedValue([
        { id: 10, product_id: 1, stock: 5 },
        { id: 11, product_id: 1, stock: 5 },
      ]);

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toEqual({ success: false, status: 400, message: 'cart.variantRequired' });
      expect(cartRepo.reserveAndAddItem).not.toHaveBeenCalled();
    });

    it('reserves the chosen variant when a variant id is given', async () => {
      cartRepo.getVariantById.mockResolvedValue({ id: 11, product_id: 1, stock: 5 });
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockResolvedValue(undefined);

      const result = await cartService.addToCart(t, 5, 1, 11);

      expect(cartRepo.getVariantById).toHaveBeenCalledWith(11);
      expect(cartRepo.getVariantsByProductId).not.toHaveBeenCalled();
      expect(cartRepo.reserveAndAddItem).toHaveBeenCalledWith(1, 11, 1);
      expect(result).toMatchObject({ success: true, status: 201 });
    });

    it('returns 404 when the chosen variant belongs to a different product', async () => {
      cartRepo.getVariantById.mockResolvedValue({ id: 11, product_id: 2, stock: 5 });

      const result = await cartService.addToCart(t, 5, 1, 11);

      expect(result).toEqual({ success: false, status: 404, message: 'cart.productNotFound' });
      expect(cartRepo.reserveAndAddItem).not.toHaveBeenCalled();
    });
  });

  describe('updateQuantity', () => {
    it('rejects a quantity below 1 without touching the repository', async () => {
      const result = await cartService.updateQuantity(t, 5, 1, 0);

      expect(result).toEqual({ success: false, status: 400, message: 'cart.quantityMin' });
      expect(cartRepo.getOrCreateCart).not.toHaveBeenCalled();
    });

    it('returns 404 when the cart item does not exist', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue(null);

      const result = await cartService.updateQuantity(t, 5, 999, 2);

      expect(result).toEqual({ success: false, status: 404, message: 'cart.itemNotFound' });
    });

    it('returns a stock-aware error (read from the variant) when the new quantity exceeds available stock', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue({ id: 1, variant_id: 10, variant: { id: 10, stock: 3, product: { id: 1 } } });
      cartRepo.reserveAndUpdateQuantity.mockRejectedValue(new Error('OUT_OF_STOCK'));

      const result = await cartService.updateQuantity(t, 5, 1, 10);

      expect(result).toEqual({ success: false, status: 400, message: 'cart.maxStock::{"stock":3}' });
    });

    it('returns 404 when the item disappears between the lookup and the reservation', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue({ id: 1, variant_id: 10, variant: { id: 10, stock: 3, product: { id: 1 } } });
      cartRepo.reserveAndUpdateQuantity.mockRejectedValue(new Error('ITEM_NOT_FOUND'));

      const result = await cartService.updateQuantity(t, 5, 1, 2);

      expect(result).toEqual({ success: false, status: 404, message: 'cart.itemNotFound' });
    });

    it('updates the quantity, invalidates the product cache (via variant.product.id), and notifies over the socket', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue({ id: 1, variant_id: 10, variant: { id: 10, stock: 5, product: { id: 1 } } });
      cartRepo.reserveAndUpdateQuantity.mockResolvedValue(undefined);

      const result = await cartService.updateQuantity(t, 5, 1, 2);

      expect(cartRepo.reserveAndUpdateQuantity).toHaveBeenCalledWith(1, 2);
      expect(redisClient.del).toHaveBeenCalledWith(['products:all', 'products:1']);
      expect(mockEmit).toHaveBeenCalledWith('products_updated');
      expect(result).toMatchObject({ success: true, status: 200 });
    });
  });

  describe('removeFromCart', () => {
    it('returns 404 when the cart item does not exist', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue(null);

      const result = await cartService.removeFromCart(t, 5, 999);

      expect(result).toEqual({ success: false, status: 404, message: 'cart.itemNotFound' });
      expect(cartRepo.releaseAndRemoveItem).not.toHaveBeenCalled();
    });

    it('removes the item, invalidates the product cache (via variant.product.id), and notifies over the socket', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue({ id: 1, variant_id: 10, variant: { id: 10, product: { id: 1 } } });

      const result = await cartService.removeFromCart(t, 5, 1);

      expect(cartRepo.releaseAndRemoveItem).toHaveBeenCalledWith(1);
      expect(redisClient.del).toHaveBeenCalledWith(['products:all', 'products:1']);
      expect(mockEmit).toHaveBeenCalledWith('products_updated');
      expect(result).toMatchObject({ success: true, status: 200, message: 'cart.removeSuccess' });
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      cartRepo.getOrCreateCart.mockRejectedValue(new Error('db down'));

      const result = await cartService.removeFromCart(t, 5, 1);

      expect(result).toEqual({ success: false, status: 500, message: 'cart.removeError' });
    });
  });
});