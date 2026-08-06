const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const authRoutes = require('./routes/v1/auth.routes');
const studentRoutes = require('./routes/v1/student.routes');
const sessionMiddleware = require('./core/config/session.config');

require('./core/email.worker');
const app = express();
app.set('trust proxy', 1);

const v1Router = require('./routes/v1');

const allowedOrigins = [
  'http://localhost:5173', 
  'http://localhost:3000', 
  'http://127.0.0.1:5173'
];

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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
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


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(` السيرفر شغال بنجاح على الرابط: http://localhost:${PORT}`);
});

module.exports = app;