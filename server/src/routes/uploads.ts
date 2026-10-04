import { Router } from 'express';
import multer from 'multer';
import { requireUser, type AuthedRequest } from '../auth.js';
import { r2Enabled, env } from '../env.js';
import { deleteObject, presignedGetUrl, publicUrl, putObject } from '../r2.js';
import { UploadModel } from '../models/index.js';

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/;
    cb(null, allowed.test(file.mimetype));
  },
});

/** Guard every upload route behind auth + a configured bucket. */
uploadsRouter.use(requireUser);
uploadsRouter.use((_req, res, next) => {
  if (!r2Enabled) {
    res.status(503).json({
      error: 'Cloudflare R2 is not configured on the server (set R2_* env vars).',
    });
    return;
  }
  next();
});

const safeName = (name: string): string => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);

/** Upload an invoice document to Cloudflare R2 and record it. */
uploadsRouter.post('/', upload.single('file'), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded (pdf or image, max 10 MB).' });
      return;
    }
    const key = `${req.ownerId}/${Date.now()}-${safeName(req.file.originalname)}`;
    const stored = await putObject(key, req.file.buffer, req.file.mimetype);
    const doc = await UploadModel.create({
      ownerId: req.ownerId,
      id: `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      key: stored.key,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      url: stored.url,
      invoiceId: typeof req.body?.invoiceId === 'string' ? req.body.invoiceId : undefined,
    });
    res.status(201).json({ upload: doc.toJSON() });
  } catch (error) {
    next(error);
  }
});

/** List the caller's uploaded documents. */
uploadsRouter.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const docs = await UploadModel.find({ ownerId: req.ownerId }).sort({ createdAt: -1 }).exec();
    const uploads = docs.map((doc) => doc.toJSON());
    res.json({ uploads });
  } catch (error) {
    next(error);
  }
});

/** Signed, time-limited download URL — works for private buckets. */
uploadsRouter.get('/:id/url', async (req: AuthedRequest, res, next) => {
  try {
    const doc = await UploadModel.findOne({ ownerId: req.ownerId, id: req.params.id }).exec();
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const url = doc.url ?? (await presignedGetUrl(doc.key));
    res.json({ url, expiresIn: doc.url ? null : 3600 });
  } catch (error) {
    next(error);
  }
});

uploadsRouter.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const doc = await UploadModel.findOneAndDelete({
      ownerId: req.ownerId,
      id: req.params.id,
    }).exec();
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    await deleteObject(doc.key).catch(() => undefined);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export const r2PublicBase = (): string => env.r2.publicBaseUrl;
export const publicUrlFor = publicUrl;
