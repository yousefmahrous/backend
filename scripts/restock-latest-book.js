import 'dotenv/config';
import prisma from '../src/core/db.js';
import redisClient from '../src/core/config/redis.client.js';


const STOCK_LEVEL = 999;

async function waitForRedis() {
  if (redisClient.isReady) return;
  await new Promise((resolve, reject) => {
    redisClient.once('ready', resolve);
    redisClient.once('error', reject);
  });
}

async function main() {
  const latestBook = await prisma.book.findFirst({ orderBy: { id: 'desc' } });

  if (!latestBook) {
    throw new Error('مفيش أي كتاب في قاعدة البيانات');
  }

  await prisma.book.update({
    where: { id: latestBook.id },
    data: { stock: STOCK_LEVEL },
  });

  await waitForRedis();
  await redisClient.del(['books:all', `books:${latestBook.id}`]);

  console.log(`تم تحديث مخزون الكتاب "${latestBook.title}" (id: ${latestBook.id}) لـ ${STOCK_LEVEL} ومسح الكاش`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redisClient.quit().catch(() => {});
  });