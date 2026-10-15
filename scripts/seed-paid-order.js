import 'dotenv/config';
import prisma from '../src/core/db.js';

const CUSTOMER_EMAIL = 'youssefmahrous445@gmail.com';

async function main() {
  const customer = await prisma.user.findUnique({ where: { email: CUSTOMER_EMAIL } });
  if (!customer) {
    throw new Error(`مفيش يوزر بالإيميل ${CUSTOMER_EMAIL}`);
  }

  const anyProduct = await prisma.product.findFirst();
  if (!anyProduct) {
    throw new Error('مفيش أي كتاب في قاعدة البيانات');
  }

  const order = await prisma.order.create({
    data: {
      user_id: customer.id,
      status: 'paid',
      payment_intent_id: `pi_test_e2e_${Date.now()}`,
      paid_at: new Date(),
      total_amount: anyProduct.price,
      currency: 'egp',
      shipping_name: 'Test Customer',
      shipping_phone: '01012345678',
      shipping_address: '12 Tahrir St, Dokki',
      shipping_city: 'Giza',
    },
  });

  const vendorOrder = await prisma.vendorOrder.create({
    data: { order_id: order.id, vendor_id: anyProduct.vendor_id },
  });

  await prisma.orderItem.create({
    data: {
      order_id: order.id,
      product_id: anyProduct.id,
      vendor_order_id: vendorOrder.id,
      quantity: 1,
      unit_price: anyProduct.price,
    },
  });

  console.log(order.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());