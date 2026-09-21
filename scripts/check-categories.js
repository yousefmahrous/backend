import 'dotenv/config';
import prisma from '../src/core/db.js';

async function main() {
  const withoutCategory = await prisma.book.findMany({
    where: { category_id: null },
    select: { id: true, category: true },
  });

  const total = await prisma.book.count();
  const categories = await prisma.category.count();

  console.log(`Categories in database: ${categories}`);
  console.log(`Books in database: ${total}`);

  if (withoutCategory.length === 0) {
    console.log('OK: every book has a category_id');
  } else {
    console.log(`Found ${withoutCategory.length} book(s) without a category_id:`);
    console.table(withoutCategory);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());