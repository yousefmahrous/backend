import prisma from '../../core/db.js';


export const getOrCreateCart = async (userId) => {
  const cart = await prisma.cart.upsert({
    where: { user_id: userId },
    update: {},
    create: { user_id: userId },
    include: {
      items: {
        include: { book: true },
        orderBy: { created_at: 'desc' }
      }
    }
  });
  return cart;
};


export const addItemToCart = async (cartId, bookId, quantity = 1) => {
  const item = await prisma.cartItem.upsert({
    where: {
      cart_id_book_id: { cart_id: cartId, book_id: bookId }
    },
    update: {
      quantity: { increment: quantity }
    },
    create: {
      cart_id: cartId,
      book_id: bookId,
      quantity
    },
    include: { book: true }
  });
  return item;
};

export const findCartItem = async (cartId, itemId) => {
  return prisma.cartItem.findFirst({
    where: { id: itemId, cart_id: cartId }
  });
};

export const updateItemQuantity = async (itemId, quantity) => {
  return prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
    include: { book: true }
  });
};

export const removeItem = async (itemId) => {
  return prisma.cartItem.delete({
    where: { id: itemId }
  });
};

export const clearCart = async (cartId) => {
  return prisma.cartItem.deleteMany({
    where: { cart_id: cartId }
  });
};

export const getBookById = async (bookId) => {
  return prisma.book.findUnique({ where: { id: bookId } });
};