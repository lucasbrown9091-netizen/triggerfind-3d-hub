import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.js'
import uploadsRoutes from './routes/uploads.js'
import scansRoutes from './routes/scans.js'

const app = express()
app.use(express.json({ limit: '2mb' }))
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }))

const limiter = rateLimit({ windowMs: 60_000, max: 60 })
app.use(limiter)

app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/auth', authRoutes)
app.use('/uploads', uploadsRoutes)
app.use('/scans', scansRoutes)

const PORT = process.env.PORT || 4000
const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI')
  process.exit(1)
}

mongoose.connect(MONGODB_URI).then(() => {
  console.log('Mongo connected')
  app.listen(PORT, () => console.log(`API on :${PORT}`))
}).catch(err => {
  console.error('Mongo connection error', err)
  process.exit(1)
})


