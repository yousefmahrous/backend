import session from 'express-session';
import { RedisStore } from 'connect-redis';
import redisClient from './redis.client.js';

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
    secure: true,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: 'none'
  }
});

export default sessionMiddleware;
