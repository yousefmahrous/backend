import prisma from '../../core/db.js';

export const getOrCreateCart = async (userId) => {
  const cart = await prisma.cart.upsert({
    where: { user_id: userId },
    update: {},
    create: { user_id: userId },
    include: {
      items: {
        include: { variant: { include: { product: true } } },
        orderBy: { created_at: 'desc' }
      }
    }
  });
  return cart;
};

export const reserveAndAddItem = async (cartId, variantId, quantity = 1) => {
  return prisma.$transaction(async (tx) => {
    const result = await tx.productVariant.updateMany({
      where: { id: variantId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } }
    });

    if (result.count === 0) {
      throw new Error('OUT_OF_STOCK');
    }

    const variant = await tx.productVariant.findUnique({ where: { id: variantId } });

    await tx.book.update({
      where: { id: variant.product_id },
      data: {
        cart_adds_count: { increment: 1 },
        popularity_score: { increment: 2 }
      }
    });

    const item = await tx.cartItem.upsert({
      where: { cart_id_variant_id: { cart_id: cartId, variant_id: variantId } },
      update: { quantity: { increment: quantity } },
      create: { cart_id: cartId, book_id: variant.product_id, variant_id: variantId, quantity },
      include: { variant: { include: { product: true } } }
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
      const result = await tx.productVariant.updateMany({
        where: { id: item.variant_id, stock: { gte: diff } },
        data: { stock: { decrement: diff } }
      });

      if (result.count === 0) {
        throw new Error('OUT_OF_STOCK');
      }
    } else if (diff < 0) {
      await tx.productVariant.update({
        where: { id: item.variant_id },
        data: { stock: { increment: -diff } }
      });
    }

    return tx.cartItem.update({
      where: { id: itemId },
      data: { quantity: newQuantity },
      include: { variant: { include: { product: true } } }
    });
  });
};

export const releaseAndRemoveItem = async (itemId) => {
  return prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('ITEM_NOT_FOUND');

    await tx.productVariant.update({
      where: { id: item.variant_id },
      data: { stock: { increment: item.quantity } }
    });

    return tx.cartItem.delete({ where: { id: itemId } });
  });
};

export const findCartItem = async (cartId, itemId) => {
  return prisma.cartItem.findFirst({
    where: { id: itemId, cart_id: cartId },
    include: { variant: { include: { product: true } } }
  });
};

export const findCartItemByVariant = async (cartId, variantId) => {
  return prisma.cartItem.findUnique({
    where: {
      cart_id_variant_id: { cart_id: cartId, variant_id: variantId }
    }
  });
};

export const updateItemQuantity = async (itemId, quantity) => {
  return prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
    include: { variant: { include: { product: true } } }
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

export const getVariantByBookId = async (bookId) => {
  return prisma.productVariant.findFirst({ where: { product_id: bookId } });
};