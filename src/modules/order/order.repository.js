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