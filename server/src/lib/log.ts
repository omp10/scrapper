import pino from 'pino'

export const log = pino({
  // 'debug' makes pino-http dump every header of every request, which buries
  // the lines you actually want. Opt in with LOG_LEVEL=debug when debugging.
  level: process.env.LOG_LEVEL ?? 'info',
  // Never let a key or a token reach the log file.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.apiKey',
      'key',
    ],
    censor: '[redacted]',
  },
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
})
