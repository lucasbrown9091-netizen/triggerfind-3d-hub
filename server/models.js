import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  licenseKey: { type: String, required: true },
  licenseType: { type: String, required: true },
}, { timestamps: true })

const LicenseKeySchema = new mongoose.Schema({
  licenseKey: { type: String, required: true, unique: true, index: true },
  licenseType: { type: String, required: true },
  isUsed: { type: Boolean, default: false },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  usedAt: { type: Date, default: null },
}, { timestamps: true })

const UploadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  folderName: { type: String, required: true },
  uploadPath: { type: String, required: true },
  fileCount: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
}, { timestamps: true })

const ScanResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  uploadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', required: true, index: true },
  scanType: { type: String, required: true },
  results: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true })

export const User = mongoose.model('User', UserSchema)
export const LicenseKey = mongoose.model('LicenseKey', LicenseKeySchema)
export const Upload = mongoose.model('Upload', UploadSchema)
export const ScanResult = mongoose.model('ScanResult', ScanResultSchema)


