import express from 'express'
import { z } from 'zod'
import { authMiddleware } from '../middleware.js'
import { Upload, ScanResult } from '../models.js'

const router = express.Router()

router.get('/', authMiddleware, async (req, res) => {
  const uploads = await Upload.find({ userId: req.userId }).sort({ uploadedAt: -1 })
  res.json({ uploads })
})

const uploadSchema = z.object({
  folderName: z.string(),
  uploadPath: z.string(),
  fileCount: z.number().int().nonnegative(),
})

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { folderName, uploadPath, fileCount } = uploadSchema.parse(req.body)
    const upload = await Upload.create({ userId: req.userId, folderName, uploadPath, fileCount })

    const scanTypes = ['triggers', 'webhooks', 'locations', 'webhook_deleter']
    for (const scanType of scanTypes) {
      await ScanResult.create({
        userId: req.userId,
        uploadId: upload._id,
        scanType,
        results: { count: Math.floor(Math.random() * 50), items: [`Sample ${scanType} 1`, `Sample ${scanType} 2`], processed_at: new Date().toISOString() }
      })
    }

    res.json({ upload })
  } catch (err) {
    res.status(400).json({ error: 'Invalid upload' })
  }
})

export default router


