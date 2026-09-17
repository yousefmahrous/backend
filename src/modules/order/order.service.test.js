import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./order.repository.js', () => ({
  findOrderByIdForUser: vi.fn(),
  findLatestOrderByUser: vi.fn(),
  findOrdersByUser: vi.fn(),
  findAllOrders: vi.fn(),
}));

const orderRepo = await import('./order.repository.js');
const orderService = await import('./order.service.js');

const t = fakeT;

const makeOrder = (overrides = {}) => ({
  id: 1,
  status: 'paid',
  total_amount: 100,
  currency: 'egp',
  created_at: 'a',
  paid_at: 'b',
  items: [{ book_id: 1, book: { title: { ar: 'كتاب', en: 'Book' } }, quantity: 2, unit_price: 50 }],
  ...overrides,
});

describe('order.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrderForUser', () => {
    it('returns 404 when the order does not belong to this user or does not exist', async () => {
      orderRepo.findOrderByIdForUser.mockResolvedValue(null);

      const result = await orderService.getOrderForUser(t, 'ar', 1, 5);

      expect(result).toEqual({ success: false, status: 404, message: 'order.notFound' });
    });

    it('serializes the order items with the localized book title for the given language', async () => {
      orderRepo.findOrderByIdForUser.mockResolvedValue(makeOrder());

      const result = await orderService.getOrderForUser(t, 'en', 1, 5);

      expect(result.data.items).toEqual([{ book_id: 1, title: 'Book', quantity: 2, unit_price: 50 }]);
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      orderRepo.findOrderByIdForUser.mockRejectedValue(new Error('db down'));

      const result = await orderService.getOrderForUser(t, 'ar', 1, 5);

      expect(result).toEqual({ success: false, status: 500, message: 'order.loadError' });
    });
  });

  describe('getLatestOrderForUser', () => {
    it('returns 404 when the user has no orders yet', async () => {
      orderRepo.findLatestOrderByUser.mockResolvedValue(null);

      const result = await orderService.getLatestOrderForUser(t, 'ar', 5);

      expect(result).toEqual({ success: false, status: 404, message: 'order.noOrdersYet' });
    });

    it('returns the latest order when one exists', async () => {
      orderRepo.findLatestOrderByUser.mockResolvedValue(makeOrder({ id: 7 }));

      const result = await orderService.getLatestOrderForUser(t, 'ar', 5);

      expect(result).toMatchObject({ success: true, status: 200, data: { id: 7 } });
    });
  });

  describe('getOrdersForUser', () => {
    it('returns an empty list when the user has no orders', async () => {
      orderRepo.findOrdersByUser.mockResolvedValue([]);

      const result = await orderService.getOrdersForUser(t, 'ar', 5);

      expect(result).toEqual({ success: true, status: 200, data: { items: [] } });
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      orderRepo.findOrdersByUser.mockRejectedValue(new Error('db down'));

      const result = await orderService.getOrdersForUser(t, 'ar', 5);

      expect(result).toEqual({ success: false, status: 500, message: 'order.loadListError' });
    });
  });

  describe('getAllOrdersAdmin', () => {
    it('paginates using sane defaults and includes the buyer on each order', async () => {
      orderRepo.findAllOrders.mockResolvedValue({ orders: [makeOrder({ user: { id: 9, name: 'Ali', email: 'a@b.com' } })], totalCount: 1 });

      const result = await orderService.getAllOrdersAdmin(t, 'ar');

      expect(orderRepo.findAllOrders).toHaveBeenCalledWith(0, 20, undefined);
      expect(result.data.items[0].user).toEqual({ id: 9, name: 'Ali', email: 'a@b.com' });
      expect(result.data.pagination).toMatchObject({ totalCount: 1, totalPages: 1, currentPage: 1 });
    });

    it('sets user to null when the order has no linked user', async () => {
      orderRepo.findAllOrders.mockResolvedValue({ orders: [makeOrder({ user: null })], totalCount: 1 });

      const result = await orderService.getAllOrdersAdmin(t, 'ar', 1, 20, 'paid');

      expect(orderRepo.findAllOrders).toHaveBeenCalledWith(0, 20, 'paid');
      expect(result.data.items[0].user).toBeNull();
    });

    it('computes skip correctly for later pages', async () => {
      orderRepo.findAllOrders.mockResolvedValue({ orders: [], totalCount: 0 });

      await orderService.getAllOrdersAdmin(t, 'ar', 3, 10);

      expect(orderRepo.findAllOrders).toHaveBeenCalledWith(20, 10, undefined);
    });
  });
});
