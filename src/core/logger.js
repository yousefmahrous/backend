import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

// In dev we want readable, colorized logs. In prod we want plain JSON lines
// (one object per line) so any log shipper — Datadog, CloudWatch, Loki,
// whatever the deploy target ends up being — can parse them without a
// custom parser.
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
  // Never let a stray log call leak credentials into the log stream.
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
