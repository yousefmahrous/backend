import 'dotenv/config';
import prisma from '../src/core/db.js';

async function main() {
  const books = await prisma.book.count();
  const variants = await prisma.productVariant.count();

  console.log(`Books: ${books}`);
  console.log(`Variants: ${variants}`);

  if (books === variants) {
    console.log('OK: every book has exactly one variant');
  } else {
    console.log('MISMATCH: counts are different, investigate before continuing');

    const booksWithoutVariant = await prisma.book.findMany({
      where: { variants: { none: {} } },
      select: { id: true, title: true },
    });
    console.log(`Books with zero variants: ${booksWithoutVariant.length}`);
    console.table(booksWithoutVariant);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());