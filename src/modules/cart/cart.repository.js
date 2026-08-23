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


export const reserveAndAddItem = async (cartId, bookId, quantity = 1) => {
  return prisma.$transaction(async (tx) => {
    const result = await tx.book.updateMany({
      where: { id: bookId, stock: { gte: quantity } },
      data: {
        stock: { decrement: quantity },
        cart_adds_count: { increment: 1 },
        popularity_score: { increment: 2 }
      }
    });

    if (result.count === 0) {
      throw new Error('OUT_OF_STOCK');
    }

    const item = await tx.cartItem.upsert({
      where: { cart_id_book_id: { cart_id: cartId, book_id: bookId } },
      update: { quantity: { increment: quantity } },
      create: { cart_id: cartId, book_id: bookId, quantity },
      include: { book: true }
    });

    return item;
  });
};

export const reserveAndUpdateQuantity = async (itemId, newQuantity) => {
  return prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('ITEM_NOT_FOUND');

    const diff = newQuantity - item.quantity;

    if (diff > 0) {
      const result = await tx.book.updateMany({
        where: { id: item.book_id, stock: { gte: diff } },
        data: { stock: { decrement: diff } }
      });

      if (result.count === 0) {
        throw new Error('OUT_OF_STOCK');
      }
    } else if (diff < 0) {
      await tx.book.update({
        where: { id: item.book_id },
        data: { stock: { increment: -diff } }
      });
    }

    return tx.cartItem.update({
      where: { id: itemId },
      data: { quantity: newQuantity },
      include: { book: true }
    });
  });
};

export const releaseAndRemoveItem = async (itemId) => {
  return prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('ITEM_NOT_FOUND');

    await tx.book.update({
      where: { id: item.book_id },
      data: { stock: { increment: item.quantity } }
    });

    return tx.cartItem.delete({ where: { id: itemId } });
  });
};

export const findCartItem = async (cartId, itemId) => {
  return prisma.cartItem.findFirst({
    where: { id: itemId, cart_id: cartId },
    include: { book: true }
  });
};

export const findCartItemByBook = async (cartId, bookId) => {
  return prisma.cartItem.findUnique({
    where: {
      cart_id_book_id: { cart_id: cartId, book_id: bookId }
    }
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