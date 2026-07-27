import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import pinoHttp from 'pino-http'
import swaggerUi from 'swagger-ui-express'
import { ZodError } from 'zod'
import mongoose from 'mongoose'
import env from './config.js'
import { log } from './lib/log.js'
import { connectDb } from './db/index.js'
import { openapi } from './docs/openapi.js'
import { authRouter } from './routes/auth.js'
import { searchRouter } from './routes/search.js'
import { exportRouter } from './routes/export.js'
import { leadsRouter } from './routes/leads.js'
import { dashboardRouter } from './routes/dashboard.js'
import { adminRouter } from './routes/admin.js'
import { HttpError } from './lib/google.js'
import { cacheBackend } from './lib/cache.js'

const app = express()

app.use(
  pinoHttp({
    logger: log,
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    // One readable line per request instead of a full header dump.
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ status: res.statusCode }),
    },
  }),
)
// Credentials must be allowed for the httpOnly refresh cookie to survive.
app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '10mb' })) // exports post the full result set back

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    cache: cacheBackend,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  }),
)

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Lead Finder API' }))
app.get('/openapi.json', (_req, res) => res.json(openapi))

app.use('/api/auth', authRouter)
app.use('/api/search', searchRouter)
app.use('/api/leads', leadsRouter)
app.use('/api/export', exportRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/admin', adminRouter)

// Express 5 forwards async rejections here automatically.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid request', issues: err.flatten() })
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  // Duplicate key — the unique indexes are doing their job.
  if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
    return res.status(409).json({ error: 'That record already exists' })
  }
  req.log.error({ err }, 'unhandled error')
  res.status(500).json({ error: 'Internal error' })
})

const server = await start()

async function start() {
  await connectDb()
  return app.listen(env.PORT, () => {
    log.info(`API on http://localhost:${env.PORT}  ·  docs at /docs  ·  cache: ${cacheBackend}`)
  })
}

// Finish in-flight requests before dropping the database connection.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info(`${signal} received, shutting down`)
    server.close(async () => {
      await mongoose.disconnect()
      process.exit(0)
    })
  })
}
