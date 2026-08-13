import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import sessionMiddleware from './core/config/session.config.js';
import { init } from './core/config/socket.config.js';
import v1Router from './routes/v1/index.js';
import './core/email.worker.js';

const app = express();
app.set('trust proxy', 1);

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
        callback(new Error('غير مسموح بواسطة CORS'));
      }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sessionMiddleware);

app.use('/api/v1', v1Router);

app.use((err, req, res, next) => {
  console.error(' Server Error Log:', err.stack || err.message || err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'حدث خطأ غير متوقع في السيرفر'
  });
});

const PORT = process.env.PORT;

const server = http.createServer(app);
init(server);

server.listen(PORT, () => {
  console.log(` السيرفر شغال بنجاح على الرابط: http://localhost:${PORT}`);
});

export default app;
