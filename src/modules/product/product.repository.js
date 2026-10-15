import prisma from '../../core/db.js';
import { getPlatformVendorId } from '../vendor/vendor.repository.js';

export const getAllProducts = async (skip, take, search = "", category = "") => {
  const searchCondition = search ? {
    OR: [
      { title: { path: ['ar'], string_contains: search } },
      { title: { path: ['en'], string_contains: search } },
    ]
  } : {};

  const whereCondition = {
    ...searchCondition,
    ...(category
      ? { categoryRef: { OR: [{ slug: category }, { parent: { slug: category } }] } }
      : {}),
    status: 'published',
    vendor: { status: 'active' }
  };

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where: whereCondition,
      skip: skip,
      take: take,
      orderBy: { id: 'desc' },
      include: { variants: true }
    }),
    prisma.product.count({
      where: whereCondition
    })
  ]);

  return { products, totalCount };
};

export const getProductById = async (id) => {
  const product = await prisma.product.findUnique({
    where: { id: parseInt(id) },
    include: { variants: true, vendor: { select: { status: true } } }
  });
  return product;
};

export const getProductByEmail = async (email) => {
  if (!email) return null;
  const product = await prisma.product.findFirst({
    where: { publisher_email: email },
    select: { id: true }
  });
  return product;
};

export const createProduct = async (productData, vendorId) => {
  const ownerVendorId = vendorId ?? (await getPlatformVendorId());
  let coverUrl = null;

  if (productData.avatar_key) {
    const endpointHost = process.env.B2_ENDPOINT.replace('https://', '');
    coverUrl = `https://${process.env.B2_BUCKET_NAME}.${endpointHost}/${productData.avatar_key}`;
  }

  const newProduct = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        title: productData.name,
        isbn: productData.number ?? null,
        publisher_email: productData.email ?? null,
        description: productData.adress,
        publisher: productData.centre ?? null,
        category: productData.category,
        category_id: productData.category_id,
        stock: productData.stock,
        price: productData.price,
        cover_key: productData.avatar_key || null,
        cover_url: coverUrl,
        vendor_id: ownerVendorId,
      }
    });

    const variants = productData.variants?.length
      ? productData.variants
      : [{ sku: null, options: {}, price: productData.price, stock: productData.stock }];

    await tx.productVariant.createMany({
      data: variants.map((variant) => ({
        product_id: product.id,
        sku: variant.sku ?? null,
        barcode: variants.length === 1 ? (productData.number ?? null) : null,
        options: variant.options ?? {},
        price: variant.price,
        stock: variant.stock,
      })),
    });

    return product;
  });

  return newProduct;
};

export const deleteProduct = async (id) => {
  const deletedProduct = await prisma.product.delete({
    where: { id: parseInt(id) }
  });
  return deletedProduct;
};

export const checkEmailForOtherProduct = async (email, id) => {
  if (!email) return false;
  const existingProduct = await prisma.product.findFirst({
    where: {
      publisher_email: email,
      id: {
        not: parseInt(id)
      }
    }
  });

  return existingProduct !== null;
};

// Keeps products.price/stock equal to the first variant, for code that still reads them.
const syncProductMirror = async (tx, productId) => {
  const first = await tx.productVariant.findFirst({ where: { product_id: productId }, orderBy: { id: 'asc' } });
  if (first) {
    await tx.product.update({ where: { id: productId }, data: { price: first.price, stock: first.stock } });
  }
};

// price/stock from the edit form only apply when the product has a single variant.
const applySingleVariantEdit = async (tx, productId, productData) => {
  const data = {};
  if (productData.price !== undefined) data.price = productData.price;
  if (productData.stock !== undefined) data.stock = productData.stock;
  if (Object.keys(data).length === 0) return;

  const variants = await tx.productVariant.findMany({ where: { product_id: productId }, select: { id: true } });
  if (variants.length === 1) {
    await tx.productVariant.update({ where: { id: variants[0].id }, data });
    await syncProductMirror(tx, productId);
  }
};

export const updateProduct = async (id, productData) => {
  const productId = parseInt(id);

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id: productId },
      data: {
        title: productData.name,
        description: productData.adress,
        publisher_email: productData.email
      }
    });

    await applySingleVariantEdit(tx, productId, productData);
    return product;
  });
};

export const getPopularProducts = async (limit = 10) => {
  return prisma.product.findMany({
    where: { status: 'published', vendor: { status: 'active' } },
    orderBy: { popularity_score: 'desc' },
    take: limit,
    include: { variants: true }
  });
};

export const getProductsByVendor = async (vendorId, skip, take) => {
  const where = { vendor_id: vendorId };
  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({ where, skip, take, orderBy: { id: 'desc' }, include: { variants: true } }),
    prisma.product.count({ where })
  ]);
  return { products, totalCount };
};

export const getVendorProductById = async (vendorId, id) => {
  return prisma.product.findFirst({
    where: { id: parseInt(id), vendor_id: vendorId },
    include: { variants: true }
  });
};

export const updateVendorProduct = async (vendorId, id, productData) => {
  const productId = parseInt(id);

  return prisma.$transaction(async (tx) => {
    const result = await tx.product.updateMany({
      where: { id: productId, vendor_id: vendorId },
      data: {
        title: productData.name,
        description: productData.adress
      }
    });

    if (result.count === 0) return null;

    await applySingleVariantEdit(tx, productId, productData);
    return tx.product.findUnique({ where: { id: productId } });
  });
};

export const deleteVendorProduct = async (vendorId, id) => {
  const result = await prisma.product.deleteMany({
    where: { id: parseInt(id), vendor_id: vendorId }
  });
  return result.count > 0;
};

const optionsKey = (options) =>
  JSON.stringify(Object.entries(options ?? {}).sort(([a], [b]) => a.localeCompare(b)));

const failWith = (code) => Object.assign(new Error(code), { code });

const ownsProduct = async (tx, productId, vendorId) => {
  const product = await tx.product.findFirst({
    where: { id: productId, ...(vendorId !== undefined ? { vendor_id: vendorId } : {}) },
    select: { id: true }
  });
  return Boolean(product);
};

const assertOptionsFree = async (tx, productId, options, exceptVariantId) => {
  const others = await tx.productVariant.findMany({
    where: { product_id: productId, ...(exceptVariantId ? { id: { not: exceptVariantId } } : {}) },
    select: { options: true }
  });
  const key = optionsKey(options);
  if (others.some((v) => optionsKey(v.options) === key)) throw failWith('VARIANT_DUPLICATE');
};

export const addVariant = async (productId, data, vendorId) => {
  const pid = parseInt(productId);
  return prisma.$transaction(async (tx) => {
    if (!(await ownsProduct(tx, pid, vendorId))) return null;
    await assertOptionsFree(tx, pid, data.options);
    return tx.productVariant.create({
      data: { product_id: pid, sku: data.sku ?? null, options: data.options, price: data.price, stock: data.stock }
    });
  });
};

export const updateVariant = async (productId, variantId, data, vendorId) => {
  const pid = parseInt(productId);
  const vid = parseInt(variantId);
  return prisma.$transaction(async (tx) => {
    if (!(await ownsProduct(tx, pid, vendorId))) return null;
    await assertOptionsFree(tx, pid, data.options, vid);
    const result = await tx.productVariant.updateMany({
      where: { id: vid, product_id: pid },
      data: { sku: data.sku ?? null, options: data.options, price: data.price, stock: data.stock }
    });
    if (result.count === 0) return null;
    await syncProductMirror(tx, pid);
    return tx.productVariant.findUnique({ where: { id: vid } });
  });
};

export const deleteVariant = async (productId, variantId, vendorId) => {
  const pid = parseInt(productId);
  const vid = parseInt(variantId);
  return prisma.$transaction(async (tx) => {
    if (!(await ownsProduct(tx, pid, vendorId))) return null;
    const count = await tx.productVariant.count({ where: { product_id: pid } });
    if (count <= 1) throw failWith('LAST_VARIANT');
    const result = await tx.productVariant.deleteMany({ where: { id: vid, product_id: pid } });
    if (result.count === 0) return null;
    await syncProductMirror(tx, pid);
    return true;
  });
};