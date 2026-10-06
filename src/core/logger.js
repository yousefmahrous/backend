import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';


const transport = isProd
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    };

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  base: { service: 'backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.secret',
      '*.STRIPE_SECRET_KEY',
      '*.RESEND_API_KEY',
    ],
    censor: '[REDACTED]',
  },
  transport,
});

export default logger;
