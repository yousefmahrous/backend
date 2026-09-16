import { createClient } from 'redis';
import logger from '../logger.js';

const redisUrl = process.env.REDIS_URL;

const useTls = typeof redisUrl === 'string' && redisUrl.startsWith('rediss://');

const redisClient = createClient({
  url: redisUrl,
  socket: useTls
    ? { tls: true, rejectUnauthorized: false }
    : {},
});

redisClient.on('error', (err) => logger.error({ err }, 'Redis connection error'));
redisClient.on('connect', () => logger.info('Connected to Redis'));

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis');
  }
})();

export default redisClient;