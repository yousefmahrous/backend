import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./cart.repository.js', () => ({
  getOrCreateCart: vi.fn(),
  reserveAndAddItem: vi.fn(),
  reserveAndUpdateQuantity: vi.fn(),
  releaseAndRemoveItem: vi.fn(),
  findCartItem: vi.fn(),
  findCartItemByBook: vi.fn(),
  updateItemQuantity: vi.fn(),
  removeItem: vi.fn(),
  clearCart: vi.fn(),
  getBookById: vi.fn(),
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
      book: { id: 1, title: 'Book', isbn: '123', category: 'fiction', cover_url: 'http://x/c.jpg', stock: 5, price: 100 },
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
    });

    it('returns a 500 when loading the cart fails unexpectedly', async () => {
      cartRepo.getOrCreateCart.mockRejectedValue(new Error('db down'));

      const result = await cartService.getCart(t, 5);

      expect(result).toEqual({ success: false, status: 500, message: 'cart.loadError' });
    });
  });

  describe('addToCart', () => {
    it('returns 404 when the book does not exist', async () => {
      cartRepo.getBookById.mockResolvedValue(null);

      const result = await cartService.addToCart(t, 5, 999);

      expect(result).toEqual({ success: false, status: 404, message: 'cart.bookNotFound' });
      expect(cartRepo.reserveAndAddItem).not.toHaveBeenCalled();
    });

    it('returns 400 without crashing when the reservation fails due to out-of-stock', async () => {
      cartRepo.getBookById.mockResolvedValue({ id: 1, stock: 0 });
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockRejectedValue(new Error('OUT_OF_STOCK'));

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toEqual({ success: false, status: 400, message: 'cart.outOfStock' });
    });

    it('adds the item, invalidates the book cache, and notifies over the socket on success', async () => {
      cartRepo.getBookById.mockResolvedValue({ id: 1, stock: 5 });
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockResolvedValue(undefined);

      const result = await cartService.addToCart(t, 5, 1);

      expect(cartRepo.reserveAndAddItem).toHaveBeenCalledWith(1, 1, 1);
      expect(redisClient.del).toHaveBeenCalledWith(['books:all', 'books:1']);
      expect(mockEmit).toHaveBeenCalledWith('books_updated');
      expect(result).toMatchObject({ success: true, status: 201, message: 'cart.addSuccess' });
    });

    it('propagates unexpected reservation errors as a 500', async () => {
      cartRepo.getBookById.mockResolvedValue({ id: 1, stock: 5 });
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockRejectedValue(new Error('something else'));

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toEqual({ success: false, status: 500, message: 'cart.addError' });
    });

    it('still succeeds when Redis fails to invalidate the cache (soft failure, not fatal)', async () => {
      cartRepo.getBookById.mockResolvedValue({ id: 1, stock: 5 });
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.reserveAndAddItem.mockResolvedValue(undefined);
      redisClient.del.mockRejectedValue(new Error('redis down'));

      const result = await cartService.addToCart(t, 5, 1);

      expect(result).toMatchObject({ success: true, status: 201 });
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

    it('returns a stock-aware error when the new quantity exceeds available stock', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue({ id: 1, book: { id: 1, stock: 3 } });
      cartRepo.reserveAndUpdateQuantity.mockRejectedValue(new Error('OUT_OF_STOCK'));

      const result = await cartService.updateQuantity(t, 5, 1, 10);

      expect(result).toEqual({ success: false, status: 400, message: 'cart.maxStock::{"stock":3}' });
    });

    it('returns 404 when the item disappears between the lookup and the reservation', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue({ id: 1, book: { id: 1, stock: 3 } });
      cartRepo.reserveAndUpdateQuantity.mockRejectedValue(new Error('ITEM_NOT_FOUND'));

      const result = await cartService.updateQuantity(t, 5, 1, 2);

      expect(result).toEqual({ success: false, status: 404, message: 'cart.itemNotFound' });
    });

    it('updates the quantity, invalidates the book cache, and notifies over the socket on success', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue({ id: 1, book: { id: 1, stock: 5 } });
      cartRepo.reserveAndUpdateQuantity.mockResolvedValue(undefined);

      const result = await cartService.updateQuantity(t, 5, 1, 2);

      expect(cartRepo.reserveAndUpdateQuantity).toHaveBeenCalledWith(1, 2);
      expect(redisClient.del).toHaveBeenCalledWith(['books:all', 'books:1']);
      expect(mockEmit).toHaveBeenCalledWith('books_updated');
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

    it('removes the item, invalidates the book cache, and notifies over the socket on success', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue(makeCart());
      cartRepo.findCartItem.mockResolvedValue({ id: 1, book: { id: 1 } });

      const result = await cartService.removeFromCart(t, 5, 1);

      expect(cartRepo.releaseAndRemoveItem).toHaveBeenCalledWith(1);
      expect(redisClient.del).toHaveBeenCalledWith(['books:all', 'books:1']);
      expect(mockEmit).toHaveBeenCalledWith('books_updated');
      expect(result).toMatchObject({ success: true, status: 200, message: 'cart.removeSuccess' });
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      cartRepo.getOrCreateCart.mockRejectedValue(new Error('db down'));

      const result = await cartService.removeFromCart(t, 5, 1);

      expect(result).toEqual({ success: false, status: 500, message: 'cart.removeError' });
    });
  });
});