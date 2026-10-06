import prisma from '../../core/db.js';

const ORDER_INCLUDE = {
  items: { include: { book: true } },
  vendorOrders: {
    orderBy: { id: 'asc' },
    include: {
      vendor: { select: { id: true, store_name: true } },
      items: { include: { book: true } }
    }
  }
};

export const findOrderByIdForUser = async (orderId, userId) => {
  return prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    include: ORDER_INCLUDE
  });
};

export const findLatestOrderByUser = async (userId) => {
  return prisma.order.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: ORDER_INCLUDE
  });
};

export const findOrdersByUser = async (userId) => {
  return prisma.order.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: ORDER_INCLUDE
  });
};

export const findAllOrders = async (skip, limit, status) => {
  const where = status ? { status } : {};
  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      include: {
        ...ORDER_INCLUDE,
        user: { select: { id: true, name: true, email: true } }
      }
    }),
    prisma.order.count({ where })
  ]);
  return { orders, totalCount };
};