import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

const useTls = typeof redisUrl === 'string' && redisUrl.startsWith('rediss://');

const queueConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  ...(useTls ? { tls: { rejectUnauthorized: false } } : {}),
});

export default queueConnection;