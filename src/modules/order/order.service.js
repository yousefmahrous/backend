import * as orderRepo from './order.repository.js';

const serializeOrder = (order) => ({
  id: order.id,
  status: order.status,
  total_amount: order.total_amount,
  currency: order.currency,
  created_at: order.created_at,
  items: order.items.map((item) => ({
    book_id: item.book_id,
    title: item.book.title,
    quantity: item.quantity,
    unit_price: item.unit_price
  }))
});

export const getOrderForUser = async (orderId, userId) => {
  try {
    const order = await orderRepo.findOrderByIdForUser(orderId, userId);

    if (!order) {
      return { success: false, status: 404, message: 'الأوردر غير موجود' };
    }

    return { success: true, status: 200, data: serializeOrder(order) };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تحميل بيانات الأوردر' };
  }
};

export const getLatestOrderForUser = async (userId) => {
  try {
    const order = await orderRepo.findLatestOrderByUser(userId);

    if (!order) {
      return { success: false, status: 404, message: 'مفيش أي أوردر لسه' };
    }

    return { success: true, status: 200, data: serializeOrder(order) };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تحميل بيانات الأوردر' };
  }
};

export const getOrdersForUser = async (userId) => {
  try {
    const orders = await orderRepo.findOrdersByUser(userId);
    return { success: true, status: 200, data: { items: orders.map(serializeOrder) } };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تحميل الأوردرات' };
  }
};