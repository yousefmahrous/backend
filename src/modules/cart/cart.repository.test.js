import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
  productVariant: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  book: { update: vi.fn() },
  cartItem: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
};

vi.mock('../../core/db.js', () => ({
  default: {
    cart: { upsert: vi.fn() },
    cartItem: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    productVariant: { findFirst: vi.fn() },
    $transaction: vi.fn((cb) => cb(tx)),
  },
}));

const prisma = (await import('../../core/db.js')).default;
const cartRepo = await import('./cart.repository.js');

describe('cart.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
  });

  describe('reserveAndAddItem', () => {
    it('decrements the variant stock and upserts the cart item inside one transaction', async () => {
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      tx.productVariant.findUnique.mockResolvedValue({ id: 10, product_id: 1 });
      tx.cartItem.upsert.mockResolvedValue({ id: 1, quantity: 1 });

      await cartRepo.reserveAndAddItem(1, 10, 2);

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 10, stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
      expect(tx.cartItem.upsert).toHaveBeenCalledWith({
        where: { cart_id_variant_id: { cart_id: 1, variant_id: 10 } },
        update: { quantity: { increment: 2 } },
        create: { cart_id: 1, book_id: 1, variant_id: 10, quantity: 2 },
        include: expect.any(Object),
      });
    });

    it('throws OUT_OF_STOCK and touches nothing else when the conditional decrement matches zero rows', async () => {
      tx.productVariant.updateMany.mockResolvedValue({ count: 0 });

      await expect(cartRepo.reserveAndAddItem(1, 10, 5)).rejects.toThrow('OUT_OF_STOCK');

      expect(tx.cartItem.upsert).not.toHaveBeenCalled();
      expect(tx.book.update).not.toHaveBeenCalled();
    });

    it('bumps the popularity counters on the parent book, not the variant', async () => {
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      tx.productVariant.findUnique.mockResolvedValue({ id: 10, product_id: 7 });
      tx.cartItem.upsert.mockResolvedValue({ id: 1 });

      await cartRepo.reserveAndAddItem(1, 10, 1);

      expect(tx.book.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { cart_adds_count: { increment: 1 }, popularity_score: { increment: 2 } },
      });
    });
  });

  describe('reserveAndUpdateQuantity', () => {
    it('throws ITEM_NOT_FOUND when the item does not exist', async () => {
      tx.cartItem.findUnique.mockResolvedValue(null);

      await expect(cartRepo.reserveAndUpdateQuantity(999, 3)).rejects.toThrow('ITEM_NOT_FOUND');
    });

    it('reserves only the difference when increasing quantity', async () => {
      tx.cartItem.findUnique.mockResolvedValue({ id: 1, variant_id: 10, quantity: 2 });
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      tx.cartItem.update.mockResolvedValue({ id: 1, quantity: 5 });

      await cartRepo.reserveAndUpdateQuantity(1, 5);

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 10, stock: { gte: 3 } },
        data: { stock: { decrement: 3 } },
      });
    });

    it('throws OUT_OF_STOCK when increasing beyond available stock, and does not update the quantity', async () => {
      tx.cartItem.findUnique.mockResolvedValue({ id: 1, variant_id: 10, quantity: 2 });
      tx.productVariant.updateMany.mockResolvedValue({ count: 0 });

      await expect(cartRepo.reserveAndUpdateQuantity(1, 100)).rejects.toThrow('OUT_OF_STOCK');
      expect(tx.cartItem.update).not.toHaveBeenCalled();
    });

    it('releases stock back (does not reserve) when decreasing quantity', async () => {
      tx.cartItem.findUnique.mockResolvedValue({ id: 1, variant_id: 10, quantity: 5 });
      tx.cartItem.update.mockResolvedValue({ id: 1, quantity: 2 });

      await cartRepo.reserveAndUpdateQuantity(1, 2);

      expect(tx.productVariant.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { stock: { increment: 3 } },
      });
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });

    it('touches no stock at all when the quantity does not change', async () => {
      tx.cartItem.findUnique.mockResolvedValue({ id: 1, variant_id: 10, quantity: 3 });
      tx.cartItem.update.mockResolvedValue({ id: 1, quantity: 3 });

      await cartRepo.reserveAndUpdateQuantity(1, 3);

      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
      expect(tx.productVariant.update).not.toHaveBeenCalled();
    });
  });

  describe('releaseAndRemoveItem', () => {
    it('throws ITEM_NOT_FOUND when the item does not exist', async () => {
      tx.cartItem.findUnique.mockResolvedValue(null);

      await expect(cartRepo.releaseAndRemoveItem(999)).rejects.toThrow('ITEM_NOT_FOUND');
    });

    it('returns the full quantity to stock before deleting the item', async () => {
      tx.cartItem.findUnique.mockResolvedValue({ id: 1, variant_id: 10, quantity: 4 });
      tx.cartItem.delete.mockResolvedValue({ id: 1 });

      await cartRepo.releaseAndRemoveItem(1);

      expect(tx.productVariant.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { stock: { increment: 4 } },
      });
      expect(tx.cartItem.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  describe('getVariantByBookId', () => {
    it('looks up the variant by the book (product) id', async () => {
      prisma.productVariant.findFirst.mockResolvedValue({ id: 10, product_id: 1 });

      const variant = await cartRepo.getVariantByBookId(1);

      expect(prisma.productVariant.findFirst).toHaveBeenCalledWith({ where: { product_id: 1 } });
      expect(variant).toEqual({ id: 10, product_id: 1 });
    });
  });
});