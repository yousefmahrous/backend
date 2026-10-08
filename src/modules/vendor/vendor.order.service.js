import * as vendorOrderRepo from './vendor.order.repository.js';
import {
  FULFILLMENT_STATUS,
  FULFILLMENT_STATUSES,
  FULFILLMENT_TRANSITIONS
} from './vendor.constants.js';
import { pickLocalized } from '../../core/i18n/localized.js';
import { addShipmentStatusEmailJob } from '../../core/email.queue.js';
import logger from '../../core/logger.js';

const serializeVendorOrder = (vendorOrder, lang) => ({
  id: vendorOrder.id,
  order_id: vendorOrder.order_id,
  order_status: vendorOrder.order.status,
  paid_at: vendorOrder.order.paid_at,
  created_at: vendorOrder.created_at,
  fulfillment_status: vendorOrder.fulfillment_status,
  carrier: vendorOrder.carrier,
  tracking_number: vendorOrder.tracking_number,
  shipped_at: vendorOrder.shipped_at,
  delivered_at: vendorOrder.delivered_at,
  shipping: {
    name: vendorOrder.order.shipping_name,
    phone: vendorOrder.order.shipping_phone,
    address: vendorOrder.order.shipping_address,
    city: vendorOrder.order.shipping_city,
    notes: vendorOrder.order.shipping_notes
  },
  items: vendorOrder.items.map((item) => ({
    book_id: item.book_id,
    title: pickLocalized(item.book.title, lang),
    quantity: item.quantity,
    unit_price: item.unit_price
  })),
  subtotal: vendorOrder.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
});

export const getMyOrders = async (t, lang, vendorId, page = 1, limit = 20, fulfillmentStatus) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;
    const safeStatus = FULFILLMENT_STATUSES.includes(fulfillmentStatus) ? fulfillmentStatus : undefined;

    const { vendorOrders, totalCount } = await vendorOrderRepo.findVendorOrders(
      vendorId,
      skip,
      limitNumber,
      safeStatus
    );
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        items: vendorOrders.map((vo) => serializeVendorOrder(vo, lang)),
        pagination: {
          totalCount,
          totalPages,
          currentPage: pageNumber,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1
        }
      }
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.orders.loadError') };
  }
};

export const getMyOrderById = async (t, lang, vendorId, id) => {
  try {
    const vendorOrder = await vendorOrderRepo.findVendorOrderById(id, vendorId);

    if (!vendorOrder) {
      return { success: false, status: 404, message: t('vendor.orders.notFound') };
    }

    return { success: true, status: 200, data: serializeVendorOrder(vendorOrder, lang) };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.orders.loadError') };
  }
};

export const updateFulfillment = async (t, lang, vendorId, id, input) => {
  try {
    const vendorOrder = await vendorOrderRepo.findVendorOrderById(id, vendorId);

    if (!vendorOrder) {
      return { success: false, status: 404, message: t('vendor.orders.notFound') };
    }

    if (vendorOrder.order.status !== 'paid') {
      return { success: false, status: 409, message: t('vendor.orders.orderNotActive') };
    }

    const allowed = FULFILLMENT_TRANSITIONS[vendorOrder.fulfillment_status] ?? [];
    if (!allowed.includes(input.status)) {
      return { success: false, status: 400, message: t('vendor.orders.invalidTransition') };
    }

    const data = { fulfillment_status: input.status };

    if (input.status === FULFILLMENT_STATUS.SHIPPED) {
      data.carrier = input.carrier;
      data.tracking_number = input.tracking_number ?? null;
      data.shipped_at = new Date();
    }

    if (input.status === FULFILLMENT_STATUS.DELIVERED) {
      data.delivered_at = new Date();
    }

    const updated = await vendorOrderRepo.transitionFulfillment(
      id,
      vendorId,
      vendorOrder.fulfillment_status,
      data
    );

    if (!updated) {
      return { success: false, status: 409, message: t('vendor.orders.statusConflict') };
    }

    const fresh = await vendorOrderRepo.findVendorOrderById(id, vendorId);

    // Best effort: a failed email must never undo or fail the status change.
    const customer = fresh.order.user;
    if (customer?.email) {
      try {
        await addShipmentStatusEmailJob(
          customer.email,
          customer.name,
          {
            order_id: fresh.order_id,
            store_name: fresh.vendor?.store_name ?? '',
            status: fresh.fulfillment_status,
            carrier: fresh.carrier,
            tracking_number: fresh.tracking_number
          },
          customer.preferred_lang
        );
      } catch (err) {
        logger.warn({ err }, 'Failed to queue shipment status email');
      }
    }

    return {
      success: true,
      status: 200,
      message: t('vendor.orders.updated'),
      data: serializeVendorOrder(fresh, lang)
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.orders.updateError') };
  }
};