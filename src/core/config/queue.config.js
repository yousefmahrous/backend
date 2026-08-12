import IORedis from 'ioredis';

const queueConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: {
    rejectUnauthorized: false
  }
});

export default queueConnection;
