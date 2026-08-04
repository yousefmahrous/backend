const session = require('express-session');
const { RedisStore } = require('connect-redis');
const redisClient = require('./redis.client');

const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'sess:',
  ttl: 86400
});

const sessionMiddleware = session({
  store: redisStore,
  secret: process.env.SESSION_SECRET, 
  resave: false,
  saveUninitialized: false,
  name: 'sessionId',
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: 'lax'
  }
});

module.exports = sessionMiddleware;