import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
  order: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  cart: { findUnique: vi.fn() },
  cartItem: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  productVariant: { updateMany: vi.fn() },
};

vi.mock('../../core/db.js', () => ({
  default: {
    $transaction: vi.fn((cb) => cb(tx)),
  },
}));

const prisma = (await import('../../core/db.js')).default;
const paymentRepo = await import('./payment.repository.js');

const makeCart = () => ({
  items: [
    { book_id: 1, quantity: 2, variant: { id: 10, price: 100 } },
    { book_id: 2, quantity: 1, variant: { id: 20, price: 250 } },
  ],
});

describe('payment.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
  });

  describe('createPendingOrderFromCart', () => {
    it('prices every order item, and the total, from the variant price, not a book price', async () => {
      tx.order.create.mockResolvedValue({ id: 1 });

      await paymentRepo.createPendingOrderFromCart(5, makeCart());

      const { data } = tx.order.create.mock.calls[0][0];
      expect(data.total_amount).toBe(2 * 100 + 1 * 250);
      expect(data.items.create).toEqual([
        { book_id: 1, quantity: 2, unit_price: 100 },
        { book_id: 2, quantity: 1, unit_price: 250 },
      ]);
    });

    it('creates the order for the given user with pending status', async () => {
      tx.order.create.mockResolvedValue({ id: 1 });

      await paymentRepo.createPendingOrderFromCart(5, makeCart());

      const { data } = tx.order.create.mock.calls[0][0];
      expect(data.user_id).toBe(5);
      expect(data.status).toBe('pending');
    });
  });

  describe('markOrderFailed', () => {
    it('does nothing and returns the order as-is when it is not pending', async () => {
      tx.order.findUnique.mockResolvedValue({ id: 1, status: 'paid' });

      const result = await paymentRepo.markOrderFailed(1);

      expect(result).toEqual({ id: 1, status: 'paid' });
      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it('releases the full quantity back to the variant and deletes the cart item when it matches exactly', async () => {
      tx.order.findUnique.mockResolvedValue({ id: 1, status: 'pending' });
      tx.order.update.mockResolvedValue({
        id: 1,
        user_id: 5,
        items: [{ book_id: 1, quantity: 3 }],
      });
      tx.cart.findUnique.mockResolvedValue({ id: 9, user_id: 5 });
      tx.cartItem.findUnique.mockResolvedValue({ id: 99, quantity: 3 });

      await paymentRepo.markOrderFailed(1);

      expect(tx.cartItem.delete).toHaveBeenCalledWith({ where: { id: 99 } });
      expect(tx.cartItem.update).not.toHaveBeenCalled();
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { product_id: 1 },
        data: { stock: { increment: 3 } },
      });
    });

    it('only decrements the cart item (and releases the smaller amount) when the customer already changed the quantity', async () => {
      tx.order.findUnique.mockResolvedValue({ id: 1, status: 'pending' });
      tx.order.update.mockResolvedValue({
        id: 1,
        user_id: 5,
        items: [{ book_id: 1, quantity: 3 }],
      });
      tx.cart.findUnique.mockResolvedValue({ id: 9, user_id: 5 });
      tx.cartItem.findUnique.mockResolvedValue({ id: 99, quantity: 5 });

      await paymentRepo.markOrderFailed(1);

      expect(tx.cartItem.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { quantity: { decrement: 3 } },
      });
      expect(tx.cartItem.delete).not.toHaveBeenCalled();
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { product_id: 1 },
        data: { stock: { increment: 3 } },
      });
    });

    it('skips an item entirely when the customer already removed it from the cart', async () => {
      tx.order.findUnique.mockResolvedValue({ id: 1, status: 'pending' });
      tx.order.update.mockResolvedValue({
        id: 1,
        user_id: 5,
        items: [{ book_id: 1, quantity: 3 }],
      });
      tx.cart.findUnique.mockResolvedValue({ id: 9, user_id: 5 });
      tx.cartItem.findUnique.mockResolvedValue(null);

      await paymentRepo.markOrderFailed(1);

      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });

    it('releases nothing when the user has no cart at all', async () => {
      tx.order.findUnique.mockResolvedValue({ id: 1, status: 'pending' });
      tx.order.update.mockResolvedValue({
        id: 1,
        user_id: 5,
        items: [{ book_id: 1, quantity: 3 }],
      });
      tx.cart.findUnique.mockResolvedValue(null);

      await paymentRepo.markOrderFailed(1);

      expect(tx.cartItem.findUnique).not.toHaveBeenCalled();
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });
  });
});