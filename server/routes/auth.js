import express from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { User, LicenseKey } from '../models.js'
import { issueJwt } from '../middleware.js'

const router = express.Router()

const signupSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
  licenseKey: z.string().min(6).max(128)
})

router.post('/signup', async (req, res) => {
  try {
    const { username, password, licenseKey } = signupSchema.parse(req.body)
    const existing = await User.findOne({ username })
    if (existing) return res.status(409).json({ error: 'Username is already taken.' })

    const normalizedKey = licenseKey.trim()
    const key = await LicenseKey.findOne({ licenseKey: normalizedKey, isUsed: false })
    if (!key) return res.status(400).json({ error: 'Invalid license key' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({ username, passwordHash, licenseKey: normalizedKey, licenseType: key.licenseType })
    key.isUsed = true
    key.usedBy = user._id
    key.usedAt = new Date()
    await key.save()

    const token = issueJwt(user._id.toString())
    return res.json({ token, user: { id: user._id, username } })
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.issues?.[0]?.message || 'Invalid input' })
    return res.status(500).json({ error: 'Signup failed' })
  }
})

const loginSchema = z.object({ username: z.string(), password: z.string() })

router.post('/login', async (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body)
    const user = await User.findOne({ username })
    if (!user) return res.status(400).json({ error: 'Invalid username or password' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(400).json({ error: 'Invalid username or password' })
    const token = issueJwt(user._id.toString())
    return res.json({ token, user: { id: user._id, username } })
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.issues?.[0]?.message || 'Invalid input' })
    return res.status(500).json({ error: 'Login failed' })
  }
})

export default router


