import * as orderRepo from './order.repository.js';
import { pickLocalized } from '../../core/i18n/localized.js';
import logger from '../../core/logger.js';

const serializeItem = (item, lang) => ({
  book_id: item.book_id,
  title: pickLocalized(item.book.title, lang),
  quantity: item.quantity,
  unit_price: item.unit_price
});

const serializeShipment = (vendorOrder, lang) => ({
  id: vendorOrder.id,
  vendor: vendorOrder.vendor
    ? { id: vendorOrder.vendor.id, store_name: vendorOrder.vendor.store_name }
    : null,
  fulfillment_status: vendorOrder.fulfillment_status,
  carrier: vendorOrder.carrier,
  tracking_number: vendorOrder.tracking_number,
  shipped_at: vendorOrder.shipped_at,
  delivered_at: vendorOrder.delivered_at,
  items: (vendorOrder.items ?? []).map((item) => serializeItem(item, lang))
});

const serializeShipping = (order) =>
  order.shipping_name
    ? {
        name: order.shipping_name,
        phone: order.shipping_phone,
        address: order.shipping_address,
        city: order.shipping_city,
        notes: order.shipping_notes
      }
    : null;

const serializeOrder = (order, lang) => ({
  id: order.id,
  status: order.status,
  total_amount: order.total_amount,
  currency: order.currency,
  created_at: order.created_at,
  paid_at: order.paid_at,
  items: order.items.map((item) => serializeItem(item, lang)),
  shipping: serializeShipping(order),
  shipments: (order.vendorOrders ?? []).map((vo) => serializeShipment(vo, lang))
});

export const getOrderForUser = async (t, lang, orderId, userId) => {
  try {
    const order = await orderRepo.findOrderByIdForUser(orderId, userId);

    if (!order) {
      return { success: false, status: 404, message: t('order.notFound') };
    }

    return { success: true, status: 200, data: serializeOrder(order, lang) };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('order.loadError') };
  }
};

export const getLatestOrderForUser = async (t, lang, userId) => {
  try {
    const order = await orderRepo.findLatestOrderByUser(userId);

    if (!order) {
      return { success: false, status: 404, message: t('order.noOrdersYet') };
    }

    return { success: true, status: 200, data: serializeOrder(order, lang) };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('order.loadError') };
  }
};

export const getOrdersForUser = async (t, lang, userId) => {
  try {
    const orders = await orderRepo.findOrdersByUser(userId);
    return { success: true, status: 200, data: { items: orders.map((order) => serializeOrder(order, lang)) } };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('order.loadListError') };
  }
};

const serializeOrderWithUser = (order, lang) => ({
  ...serializeOrder(order, lang),
  user: order.user
    ? { id: order.user.id, name: order.user.name, email: order.user.email }
    : null
});

export const getAllOrdersAdmin = async (t, lang, page = 1, limit = 20, status) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;

    const { orders, totalCount } = await orderRepo.findAllOrders(skip, limitNumber, status);
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        items: orders.map((order) => serializeOrderWithUser(order, lang)),
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
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('order.loadListError') };
  }
};