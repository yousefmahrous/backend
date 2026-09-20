import 'dotenv/config';
import bcrypt from 'bcrypt';
import prisma from '../src/core/db.js';

const CUSTOMER = { name: 'Youssef Mahrous', email: 'youssefmahrous445@gmail.com', password: '123456' };
const ADMIN = { name: 'Admin', email: 'admin@admin.com', password: 'admin123' };

const BOOKS = [
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
    description: { ar: 'كتاب علمي لستيفن هوكينج.', en: 'A popular science book by Stephen Hawking.' },
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

  const platformVendor = await prisma.vendor.findFirstOrThrow({ where: { is_platform: true } });

  for (const book of BOOKS) {
    const existing = await prisma.book.findFirst({ where: { isbn: book.isbn } });
    if (existing) {
      await prisma.book.update({ where: { id: existing.id }, data: { stock: book.stock } });
    } else {
      await prisma.book.create({ data: { ...book, vendor_id: platformVendor.id } });
    }
  }
  const bookCount = await prisma.book.count();
  console.log(`Seeded catalog: ${bookCount} book(s) in database`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());