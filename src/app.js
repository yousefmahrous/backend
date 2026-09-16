import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import { randomUUID } from 'crypto';
import pinoHttp from 'pino-http';
import { globalLimiter } from './core/middlewares/rateLimiter.middleware.js';
import helmet from 'helmet';
import sessionMiddleware from './core/config/session.config.js';
import { init } from './core/config/socket.config.js';
import { registerTicketSocketHandlers } from './modules/ticket/ticket.socket.js';
import v1Router from './routes/v1/index.js';
import * as paymentService from './modules/payment/payment.service.js';
import { i18nMiddleware } from './core/i18n/i18n.js';
import logger from './core/logger.js';
import './core/email.worker.js';

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {

      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  })
);


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Structured request logging: one concise line per successful request
// (method, url, status, timing), with the full request/response detail
// (headers, query, params) attached only when something actually went
// wrong (4xx/5xx) — that's the only time that detail is worth the noise.
// The request id ties this line back to the detailed `err` log emitted by
// the error-handling middleware at the bottom of this file.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      const id = existing || randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    // Health checks and the raw Stripe webhook body would otherwise spam
    // the log on every poll / event with little value.
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.url} -> ${res.statusCode}`,
    // Keep the always-on line small.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    // ...and only bolt the heavy detail back on when the response failed.
    customProps: (req, res) => {
      if (res.statusCode < 400) return {};
      return {
        requestHeaders: req.headers,
        requestQuery: req.query,
        requestParams: req.params,
      };
    },
  })
);

app.use(cookieParser());
app.use(i18nMiddleware);
app.use(globalLimiter);

const allowedOrigins = [
  process.env.CLIENT_URL_DEV,
  process.env.CLIENT_URL_DEV_2,
  process.env.CLIENT_URL_DEV_3,
  process.env.CLIENT_URL_DEV_4,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'x-lang'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
);


app.post(
  '/api/v1/payment/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const { status, ...response } = await paymentService.handleWebhookEvent(req.body, signature);
    res.status(status).json(response);
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

app.use('/api/v1', v1Router);

app.use((err, req, res, next) => {
  // req.log is the pino-http child logger for this request, so this line
  // carries the request id, method, and path automatically.
  (req.log || logger).error({ err }, 'Unhandled server error');

  res.status(err.status || 500).json({
    success: false,
    message: err.message || req.t?.('common.unexpectedError') || 'An unexpected server error occurred'
  });
});

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
init(server);
registerTicketSocketHandlers();

server.listen(PORT, () => {
  logger.info(`Server running at http://localhost:${PORT}`);
});

const shutdown = (signal) => () => {
  logger.info(`${signal} received, closing server...`);
  server.close(() => process.exit(0));
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — process will exit');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection — process will exit');
  process.exit(1);
});

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

export default app;