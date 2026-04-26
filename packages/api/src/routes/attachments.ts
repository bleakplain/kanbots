import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import type { ConfigPayload } from './config.js';

export interface AttachmentsDeps {
  config: ConfigPayload;
}

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
};

const EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

const uploadSchema = z
  .object({
    contentType: z.string().min(1).max(120),
    dataBase64: z.string().min(1).max(Math.ceil((MAX_BYTES * 4) / 3) + 100),
    filename: z.string().max(200).optional(),
  })
  .strict();

const filenameSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/, 'invalid attachment filename');

function attachmentsDir(repoPath: string): string {
  return resolve(repoPath, '.kanbots', 'attachments');
}

export interface UploadAttachmentResponse {
  filename: string;
  absolutePath: string;
  relativePath: string;
  size: number;
  contentType: string;
}

export function attachmentsRouter(deps: AttachmentsDeps): Router {
  const router = Router();

  router.post('/attachments', async (req, res) => {
    if (!deps.config.repoPath) {
      res
        .status(400)
        .json({ error: 'BadRequest', message: 'no active workspace; cannot save attachments' });
      return;
    }
    const parsed = uploadSchema.parse(req.body);
    const ext = MIME_EXT[parsed.contentType.toLowerCase()];
    if (!ext) {
      res.status(415).json({
        error: 'UnsupportedMediaType',
        message: `unsupported content type ${parsed.contentType}`,
      });
      return;
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(parsed.dataBase64, 'base64');
    } catch {
      res.status(400).json({ error: 'BadRequest', message: 'invalid base64 payload' });
      return;
    }
    if (buf.length === 0) {
      res.status(400).json({ error: 'BadRequest', message: 'empty payload' });
      return;
    }
    if (buf.length > MAX_BYTES) {
      res.status(413).json({
        error: 'PayloadTooLarge',
        message: `attachment exceeds ${MAX_BYTES} bytes`,
      });
      return;
    }

    const dir = attachmentsDir(deps.config.repoPath);
    await mkdir(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = randomBytes(4).toString('hex');
    const filename = `${stamp}-${rand}${ext}`;
    const absolutePath = join(dir, filename);
    await writeFile(absolutePath, buf);

    const payload: UploadAttachmentResponse = {
      filename,
      absolutePath,
      relativePath: `.kanbots/attachments/${filename}`,
      size: buf.length,
      contentType: parsed.contentType,
    };
    res.status(201).json(payload);
  });

  router.get('/attachments/:name', async (req, res) => {
    if (!deps.config.repoPath) {
      res.status(404).end();
      return;
    }
    const name = filenameSchema.parse(req.params.name);
    const abs = join(attachmentsDir(deps.config.repoPath), name);
    try {
      const info = await stat(abs);
      if (!info.isFile()) {
        res.status(404).end();
        return;
      }
    } catch {
      res.status(404).end();
      return;
    }
    const mime = EXT_MIME[extname(name).toLowerCase()] ?? 'application/octet-stream';
    res.setHeader('content-type', mime);
    res.setHeader('cache-control', 'private, max-age=3600');
    createReadStream(abs).pipe(res);
  });

  return router;
}
