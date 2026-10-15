import 'dotenv/config';
import bcrypt from 'bcrypt';
import prisma from '../src/core/db.js';

const CUSTOMER = { name: 'Youssef Mahrous', email: 'youssefmahrous445@gmail.com', password: '123456' };
const ADMIN = { name: 'Admin', email: 'admin@admin.com', password: 'admin123' };

const PRODUCTS = [
  {
    title: { ar: 'مئة عام من العزلة', en: 'One Hundred Years of Solitude' },
    description: { ar: 'رواية كلاسيكية لغابرييل غارثيا ماركيز.', en: 'A classic novel by Gabriel García Márquez.' },
    isbn: '978-0060883287',
    publisher_email: 'publisher1@example.com',
    publisher: 'Harper Perennial',
    category: 'novels',
    price: 25000,
    stock: 50,
  },
  {
    title: { ar: 'موجز تاريخ الزمن', en: 'A Brief History of Time' },
    description: { ar: 'كتاب علمي لستيفن هوكينج.', en: 'A popular science product by Stephen Hawking.' },
    isbn: '978-0553380163',
    publisher_email: 'publisher2@example.com',
    publisher: 'Bantam',
    category: 'science',
    price: 30000,
    stock: 50,
  },
  {
    title: { ar: 'قصة حضارة', en: 'The Story of Civilization' },
    description: { ar: 'موسوعة تاريخية لويل ديورانت.', en: 'A historical encyclopedia by Will Durant.' },
    isbn: '978-1567310238',
    publisher_email: 'publisher3@example.com',
    publisher: 'Simon & Schuster',
    category: 'history',
    price: 40000,
    stock: 50,
  },
];

async function upsertUser({ name, email, password, role }) {
  const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
  return prisma.user.upsert({
    where: { email },
    update: { is_email_verified: true, role },
    create: {
      name,
      email,
      password: hashedPassword,
      role,
      is_email_verified: true,
    },
  });
}

async function main() {
  const customer = await upsertUser({ ...CUSTOMER, role: 'customer' });
  const admin = await upsertUser({ ...ADMIN, role: 'admin' });
  console.log(`Seeded users: customer#${customer.id}, admin#${admin.id}`);

  // Products must belong to a vendor now. The migration creates the store's own
  // vendor, so the seed just looks it up.
  const platformVendor = await prisma.vendor.findFirstOrThrow({ where: { is_platform: true } });
  const categories = await prisma.category.findMany();
  const categoryIdBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  for (const product of PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { isbn: product.isbn } });
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data: { stock: product.stock } });
    } else {
      await prisma.product.create({
        data: { ...product, vendor_id: platformVendor.id, category_id: categoryIdBySlug[product.category] }
      });
    }
  }
  const productCount = await prisma.product.count();
  console.log(`Seeded catalog: ${productCount} product(s) in database`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());