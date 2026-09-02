import 'dotenv/config';
import prisma from '../src/core/db.js';

const CUSTOMER_EMAIL = 'youssefmahrous445@gmail.com';

async function main() {
  const customer = await prisma.user.findUnique({ where: { email: CUSTOMER_EMAIL } });
  if (!customer) {
    throw new Error(`مفيش يوزر بالإيميل ${CUSTOMER_EMAIL}`);
  }

  const anyBook = await prisma.book.findFirst();
  if (!anyBook) {
    throw new Error('مفيش أي كتاب في قاعدة البيانات');
  }

  const order = await prisma.order.create({
    data: {
      user_id: customer.id,
      status: 'paid',
      payment_intent_id: `pi_test_e2e_${Date.now()}`,
      paid_at: new Date(),
      total_amount: anyBook.price,
      currency: 'egp',
      items: {
        create: [{ book_id: anyBook.id, quantity: 1, unit_price: anyBook.price }],
      },
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