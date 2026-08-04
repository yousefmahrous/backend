const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: true,
    rejectUnauthorized: false
  }
});

redisClient.on('error', (err) => console.error('خطأ في اتصال Redis:', err.message));
redisClient.on('connect', () => console.log(' تم الاتصال بـ Upstash Redis بنجاح!'));

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('فشل الاتصال بـ Redis:', err.message);
  }
})();

module.exports = redisClient;