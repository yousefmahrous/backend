import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
  order: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  vendorOrder: { create: vi.fn() },
  orderItem: { createMany: vi.fn() },
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
    { book_id: 1, quantity: 2, variant: { id: 10, price: 100, product: { vendor_id: 7 } } },
    { book_id: 2, quantity: 1, variant: { id: 20, price: 250, product: { vendor_id: 8 } } },
    { book_id: 3, quantity: 1, variant: { id: 30, price: 50, product: { vendor_id: 7 } } },
  ],
});

const shipping = {
  name: 'Ali Hassan',
  phone: '01012345678',
  address: '12 Tahrir St, Dokki',
  city: 'Giza',
  notes: null,
};

describe('payment.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
  });

  describe('createPendingOrderFromCart', () => {
    beforeEach(() => {
      tx.order.create.mockResolvedValue({ id: 1 });
      tx.order.findUnique.mockResolvedValue({ id: 1, items: [] });
      let nextVendorOrderId = 100;
      tx.vendorOrder.create.mockImplementation(async ({ data }) => ({
        id: nextVendorOrderId++,
        ...data,
      }));
    });

    it('prices the total and every order item from the variant price, not a book price', async () => {
      await paymentRepo.createPendingOrderFromCart(5, makeCart(), shipping);

      const { data } = tx.order.create.mock.calls[0][0];
      expect(data.total_amount).toBe(2 * 100 + 1 * 250 + 1 * 50);

      const { data: items } = tx.orderItem.createMany.mock.calls[0][0];
      expect(items.map(({ book_id, quantity, unit_price }) => ({ book_id, quantity, unit_price }))).toEqual([
        { book_id: 1, quantity: 2, unit_price: 100 },
        { book_id: 2, quantity: 1, unit_price: 250 },
        { book_id: 3, quantity: 1, unit_price: 50 },
      ]);
    });

    it('creates the order for the given user with pending status', async () => {
      await paymentRepo.createPendingOrderFromCart(5, makeCart(), shipping);

      const { data } = tx.order.create.mock.calls[0][0];
      expect(data.user_id).toBe(5);
      expect(data.status).toBe('pending');
    });

    it('stores the shipping address on the order', async () => {
      await paymentRepo.createPendingOrderFromCart(5, makeCart(), { ...shipping, notes: 'Ring twice' });

      const { data } = tx.order.create.mock.calls[0][0];
      expect(data).toMatchObject({
        shipping_name: 'Ali Hassan',
        shipping_phone: '01012345678',
        shipping_address: '12 Tahrir St, Dokki',
        shipping_city: 'Giza',
        shipping_notes: 'Ring twice',
      });
    });

    it('creates exactly one vendor order per vendor in the cart', async () => {
      await paymentRepo.createPendingOrderFromCart(5, makeCart(), shipping);

      expect(tx.vendorOrder.create).toHaveBeenCalledTimes(2);
      expect(tx.vendorOrder.create).toHaveBeenCalledWith({ data: { order_id: 1, vendor_id: 7 } });
      expect(tx.vendorOrder.create).toHaveBeenCalledWith({ data: { order_id: 1, vendor_id: 8 } });
    });

    it("links each order item to its own vendor's vendor order", async () => {
      await paymentRepo.createPendingOrderFromCart(5, makeCart(), shipping);

      const { data: items } = tx.orderItem.createMany.mock.calls[0][0];
      expect(items.map((i) => [i.book_id, i.vendor_order_id])).toEqual([
        [1, 100],
        [2, 101],
        [3, 100],
      ]);
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