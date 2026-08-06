const IORedis = require('ioredis');

const queueConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: {
    rejectUnauthorized: false
  }
});

module.exports = queueConnection;