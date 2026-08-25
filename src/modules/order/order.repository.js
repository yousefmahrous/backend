import prisma from '../../core/db.js';

export const findOrderByIdForUser = async (orderId, userId) => {
  return prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    include: { items: { include: { book: true } } }
  });
};

export const findLatestOrderByUser = async (userId) => {
  return prisma.order.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: { items: { include: { book: true } } }
  });
};

export const findOrdersByUser = async (userId) => {
  return prisma.order.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: { items: { include: { book: true } } }
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
        items: { include: { book: true } },
        user: { select: { id: true, name: true, email: true } }
      }
    }),
    prisma.order.count({ where })
  ]);
  return { orders, totalCount };
};