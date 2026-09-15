import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import { globalLimiter } from './core/middlewares/rateLimiter.middleware.js';
import helmet from 'helmet';
import sessionMiddleware from './core/config/session.config.js';
import { init } from './core/config/socket.config.js';
import { registerTicketSocketHandlers } from './modules/ticket/ticket.socket.js';
import v1Router from './routes/v1/index.js';
import * as paymentService from './modules/payment/payment.service.js';
import { i18nMiddleware } from './core/i18n/i18n.js';
import './core/email.worker.js';

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
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
  console.error(' Server Error Log:', err.stack || err.message || err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || req.t?.('common.unexpectedError') || 'An unexpected server error occurred'
  });
});

const PORT = process.env.PORT;

const server = http.createServer(app);
init(server);
registerTicketSocketHandlers();

server.listen(PORT, () => {
  console.log(` السيرفر شغال بنجاح على الرابط: http://localhost:${PORT}`);
});

export default app;