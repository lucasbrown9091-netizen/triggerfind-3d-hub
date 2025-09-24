import express from 'express'
import { authMiddleware } from '../middleware.js'
import { ScanResult } from '../models.js'

const router = express.Router()

router.get('/', authMiddleware, async (req, res) => {
  const { uploadId } = req.query
  if (!uploadId) return res.status(400).json({ error: 'uploadId required' })
  const scans = await ScanResult.find({ userId: req.userId, uploadId }).sort({ createdAt: -1 })
  res.json({ scans })
})

export default router


