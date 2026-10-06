import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./vendor.order.repository.js', () => ({
  findVendorOrders: vi.fn(),
  findVendorOrderById: vi.fn(),
  transitionFulfillment: vi.fn(),
}));

const repo = await import('./vendor.order.repository.js');
const service = await import('./vendor.order.service.js');
const { updateFulfillmentSchema } = await import('./vendor.schema.js');

const t = fakeT;

const makeVendorOrder = (overrides = {}) => ({
  id: 3,
  order_id: 10,
  created_at: 'c',
  fulfillment_status: 'pending',
  carrier: null,
  tracking_number: null,
  shipped_at: null,
  delivered_at: null,
  order: {
    id: 10,
    status: 'paid',
    paid_at: 'p',
    shipping_name: 'Ali Hassan',
    shipping_phone: '01012345678',
    shipping_address: '12 Tahrir St',
    shipping_city: 'Giza',
    shipping_notes: null,
  },
  items: [
    { book_id: 1, book: { title: { ar: 'كتاب', en: 'Book' } }, quantity: 2, unit_price: 50 },
    { book_id: 2, book: { title: { ar: 'قلم', en: 'Pen' } }, quantity: 1, unit_price: 30 },
  ],
  ...overrides,
});

describe('vendor.order.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMyOrders', () => {
    it("serializes the shipping address, localized items and the vendor's subtotal", async () => {
      repo.findVendorOrders.mockResolvedValue({ vendorOrders: [makeVendorOrder()], totalCount: 1 });

      const result = await service.getMyOrders(t, 'en', 7);

      expect(result.status).toBe(200);
      const [item] = result.data.items;
      expect(item.shipping).toEqual({
        name: 'Ali Hassan',
        phone: '01012345678',
        address: '12 Tahrir St',
        city: 'Giza',
        notes: null,
      });
      expect(item.items.map((i) => i.title)).toEqual(['Book', 'Pen']);
      expect(item.subtotal).toBe(2 * 50 + 30);
    });

    it('scopes the query to the given vendor and ignores an unknown status filter', async () => {
      repo.findVendorOrders.mockResolvedValue({ vendorOrders: [], totalCount: 0 });

      await service.getMyOrders(t, 'en', 7, 2, 10, 'bogus');

      expect(repo.findVendorOrders).toHaveBeenCalledWith(7, 10, 10, undefined);
    });

    it('passes a valid fulfillment status filter through', async () => {
      repo.findVendorOrders.mockResolvedValue({ vendorOrders: [], totalCount: 0 });

      await service.getMyOrders(t, 'en', 7, 1, 20, 'shipped');

      expect(repo.findVendorOrders).toHaveBeenCalledWith(7, 0, 20, 'shipped');
    });

    it('returns a 500 when the repository throws', async () => {
      repo.findVendorOrders.mockRejectedValue(new Error('db down'));

      const result = await service.getMyOrders(t, 'en', 7);

      expect(result).toEqual({ success: false, status: 500, message: 'vendor.orders.loadError' });
    });
  });

  describe('getMyOrderById', () => {
    it("returns 404 for an order that isn't this vendor's", async () => {
      repo.findVendorOrderById.mockResolvedValue(null);

      const result = await service.getMyOrderById(t, 'en', 7, 3);

      expect(repo.findVendorOrderById).toHaveBeenCalledWith(3, 7);
      expect(result).toEqual({ success: false, status: 404, message: 'vendor.orders.notFound' });
    });
  });

  describe('updateFulfillment', () => {
    it('returns 404 when the shipment is not found for this vendor', async () => {
      repo.findVendorOrderById.mockResolvedValue(null);

      const result = await service.updateFulfillment(t, 'en', 7, 3, { status: 'processing' });

      expect(result.status).toBe(404);
      expect(repo.transitionFulfillment).not.toHaveBeenCalled();
    });

    it('refuses to update when the order is under return or refund', async () => {
      repo.findVendorOrderById.mockResolvedValue(
        makeVendorOrder({ order: { ...makeVendorOrder().order, status: 'return_requested' } })
      );

      const result = await service.updateFulfillment(t, 'en', 7, 3, { status: 'processing' });

      expect(result).toEqual({ success: false, status: 409, message: 'vendor.orders.orderNotActive' });
      expect(repo.transitionFulfillment).not.toHaveBeenCalled();
    });

    it.each([
      ['pending', 'shipped'],
      ['pending', 'delivered'],
      ['processing', 'delivered'],
      ['shipped', 'processing'],
      ['delivered', 'shipped'],
    ])('rejects the invalid transition %s -> %s', async (from, to) => {
      repo.findVendorOrderById.mockResolvedValue(makeVendorOrder({ fulfillment_status: from }));

      const result = await service.updateFulfillment(t, 'en', 7, 3, { status: to, carrier: 'Bosta' });

      expect(result).toEqual({ success: false, status: 400, message: 'vendor.orders.invalidTransition' });
      expect(repo.transitionFulfillment).not.toHaveBeenCalled();
    });

    it('moves pending -> processing with a compare-and-set on the current status', async () => {
      repo.findVendorOrderById.mockResolvedValue(makeVendorOrder());
      repo.transitionFulfillment.mockResolvedValue(true);

      const result = await service.updateFulfillment(t, 'en', 7, 3, { status: 'processing' });

      expect(repo.transitionFulfillment).toHaveBeenCalledWith(3, 7, 'pending', { fulfillment_status: 'processing' });
      expect(result).toMatchObject({ success: true, status: 200, message: 'vendor.orders.updated' });
    });

    it('records carrier, tracking number and shipped_at when marking as shipped', async () => {
      repo.findVendorOrderById.mockResolvedValue(makeVendorOrder({ fulfillment_status: 'processing' }));
      repo.transitionFulfillment.mockResolvedValue(true);

      await service.updateFulfillment(t, 'en', 7, 3, { status: 'shipped', carrier: 'Bosta', tracking_number: 'TRK1' });

      const [, , from, data] = repo.transitionFulfillment.mock.calls[0];
      expect(from).toBe('processing');
      expect(data).toMatchObject({ fulfillment_status: 'shipped', carrier: 'Bosta', tracking_number: 'TRK1' });
      expect(data.shipped_at).toBeInstanceOf(Date);
    });

    it('stores a null tracking number when none is given', async () => {
      repo.findVendorOrderById.mockResolvedValue(makeVendorOrder({ fulfillment_status: 'processing' }));
      repo.transitionFulfillment.mockResolvedValue(true);

      await service.updateFulfillment(t, 'en', 7, 3, { status: 'shipped', carrier: 'Bosta' });

      expect(repo.transitionFulfillment.mock.calls[0][3].tracking_number).toBeNull();
    });

    it('sets delivered_at when marking as delivered', async () => {
      repo.findVendorOrderById.mockResolvedValue(makeVendorOrder({ fulfillment_status: 'shipped' }));
      repo.transitionFulfillment.mockResolvedValue(true);

      await service.updateFulfillment(t, 'en', 7, 3, { status: 'delivered' });

      const data = repo.transitionFulfillment.mock.calls[0][3];
      expect(data.fulfillment_status).toBe('delivered');
      expect(data.delivered_at).toBeInstanceOf(Date);
    });

    it('returns 409 when someone else changed the shipment first', async () => {
      repo.findVendorOrderById.mockResolvedValue(makeVendorOrder());
      repo.transitionFulfillment.mockResolvedValue(false);

      const result = await service.updateFulfillment(t, 'en', 7, 3, { status: 'processing' });

      expect(result).toEqual({ success: false, status: 409, message: 'vendor.orders.statusConflict' });
    });

    it('returns a 500 when something throws unexpectedly', async () => {
      repo.findVendorOrderById.mockRejectedValue(new Error('db down'));

      const result = await service.updateFulfillment(t, 'en', 7, 3, { status: 'processing' });

      expect(result).toEqual({ success: false, status: 500, message: 'vendor.orders.updateError' });
    });
  });

  describe('updateFulfillmentSchema', () => {
    const parse = (body) => updateFulfillmentSchema(t).safeParse(body);

    it('requires a carrier when marking as shipped', () => {
      const result = parse({ status: 'shipped' });
      expect(result.error.flatten().fieldErrors.carrier).toEqual(['vendor.orders.validation.carrierRequired']);
    });

    it('treats a blank carrier as missing', () => {
      expect(parse({ status: 'shipped', carrier: '   ' }).success).toBe(false);
    });

    it('does not require a carrier for other statuses', () => {
      expect(parse({ status: 'processing' }).success).toBe(true);
      expect(parse({ status: 'delivered', tracking_number: '' }).success).toBe(true);
    });

    it('rejects "pending" and unknown statuses as a target', () => {
      expect(parse({ status: 'pending' }).success).toBe(false);
      expect(parse({ status: 'cancelled' }).success).toBe(false);
    });
  });
});