import express, { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import {
  generateR2PresignedUploadUrl,
  uploadBufferToR2ServerSide,
  getR2ObjectStream,
  testR2Connectivity,
  getR2RuntimeConfig,
  updateR2RuntimeConfig,
  saveLocalMediaBuffer,
  isR2Configured,
  isMockStorageAllowed,
  validateUploadRequest,
  sanitizeMediaObjectKey,
  parseMediaKeyParts,
  assertUploadKeyOwnedByUser,
  normalizeContentType,
  getCategoryAllowedMimes,
  getCategoryMaxBytes,
  deleteObjectsByKeys,
  tryExtractR2ObjectKeyFromUrl,
  StorageValidationError,
  StorageNotConfiguredError,
  PUBLIC_MEDIA_CATEGORIES,
  PRIVATE_MEDIA_CATEGORIES,
  isAllowedUploadCategory,
} from '../r2Storage';

/** Categories a non-admin user may delete from their own profile media. */
const USER_DELETABLE_CATEGORIES = new Set([
  'gallery',
  'gallery_video',
  'avatar',
  'moment',
  'intro_video',
  'chat_media',
]);
import {
  requireAuth,
  requireAdmin,
  extractBearerToken,
  verifyAccessToken,
  sendUnauthorized,
  sendForbidden,
} from '../middleware/auth';

function resolveUploadOwnerUserId(req: express.Request): string | null {
  const profileId = String((req as any).profileId || (req as any).profile?.id || '').trim();
  if (profileId) return profileId;
  const authId = String((req as any).user?.id || '').trim();
  return authId || null;
}

async function readRequestRawBody(req: express.Request, maxBytes: number): Promise<Buffer> {
  if (Buffer.isBuffer((req as any).body)) return (req as any).body as Buffer;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new StorageValidationError(`File exceeds max upload size (${maxBytes} bytes)`, 413, 'FILE_TOO_LARGE', {
        maxBytes,
      });
    }
    chunks.push(buf);
  }
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

function parseMultipartFormData(
  buffer: Buffer,
  contentType: string
): {
  fields: Record<string, string>;
  file: { fieldName: string; filename: string; contentType: string; buffer: Buffer } | null;
} {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ''));
  const boundary = (m && (m[1] || m[2]) || '').trim();
  if (!boundary || !buffer.length) return { fields: {}, file: null };

  const delim = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  let file: { fieldName: string; filename: string; contentType: string; buffer: Buffer } | null = null;

  let start = buffer.indexOf(delim);
  if (start < 0) return { fields, file };
  start += delim.length;
  if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

  while (start < buffer.length) {
    const next = buffer.indexOf(delim, start);
    const end = next >= 0 ? next : buffer.length;
    let partEnd = end;
    if (partEnd >= 2 && buffer[partEnd - 2] === 13 && buffer[partEnd - 1] === 10) {
      partEnd -= 2;
    }
    const part = buffer.subarray(start, partEnd);
    const headerSep = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerSep >= 0) {
      const headerText = part.subarray(0, headerSep).toString('utf8');
      const body = part.subarray(headerSep + 4);
      const nameMatch = /name="([^"]+)"/i.exec(headerText);
      const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
      const name = nameMatch ? nameMatch[1] : '';
      if (filenameMatch && name) {
        const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
        file = {
          fieldName: name,
          filename: filenameMatch[1] || 'upload.bin',
          contentType: (ctMatch && ctMatch[1].trim()) || 'application/octet-stream',
          buffer: Buffer.from(body),
        };
      } else if (name) {
        fields[name] = body.toString('utf8');
      }
    }
    if (next < 0) break;
    start = next + delim.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
  }

  return { fields, file };
}

function isAdminRequest(req: express.Request): boolean {
  const profile = (req as any).profile;
  const appRole = (req as any).user?.app_metadata?.role;
  return profile?.role === 'admin' || appRole === 'admin';
}

function sendStorageError(res: express.Response, err: unknown) {
  if (err instanceof StorageNotConfiguredError) {
    return res.status(503).json({
      success: false,
      configured: false,
      error: err.message,
      code: err.code,
    });
  }
  if (err instanceof StorageValidationError) {
    return res.status(err.status).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(err.details || {}),
    });
  }
  const message = err instanceof Error ? err.message : 'Storage error';
  console.error('[Storage API] Unexpected error:', err);
  return res.status(500).json({ success: false, error: message });
}

/** Soft-auth: attach user/profile when Bearer present; never 401 by itself. */
async function tryAttachAuth(req: express.Request): Promise<void> {
  if ((req as any).user?.id) return;
  const token = extractBearerToken(req);
  if (!token) return;
  try {
    const verified = await verifyAccessToken(token);
    if (!verified) return;
    (req as any).user = verified.user;
    (req as any).accessToken = token;
    (req as any).profile = verified.profile;
    (req as any).profileId = verified.profile?.id || verified.user.id;
  } catch (err) {
    console.warn('[Storage Media] Optional auth attach failed:', err);
  }
}

export function createStorageRouter(_ctx: ServerRuntime): Router {
  const router = Router();

  // Generate S3 Presigned PUT URL for direct browser uploads
  router.post('/presigned-url', requireAuth, async (req, res) => {
    try {
      const { filename, contentType, fileSize, category } = req.body || {};
      if (!filename) return res.status(400).json({ success: false, error: 'Filename is required' });

      const ownerUserId = resolveUploadOwnerUserId(req);
      if (!ownerUserId) {
        return res.status(401).json({ success: false, error: 'Authenticated user is required for storage uploads' });
      }

      const data = await generateR2PresignedUploadUrl({
        filename,
        contentType: contentType || '',
        fileSize: Number(fileSize) || 0,
        userId: ownerUserId,
        category: category || 'chat_media',
      });
      return res.json(data);
    } catch (err: any) {
      return sendStorageError(res, err);
    }
  });

  // Fallback multipart (preferred) or base64 JSON when browser PUT/CORS fails
  router.post('/upload', requireAuth, async (req, res) => {
    try {
      const ownerUserId = resolveUploadOwnerUserId(req);
      if (!ownerUserId) {
        return res.status(401).json({ success: false, error: 'Authenticated user is required for storage uploads' });
      }

      const contentTypeHeader = String(req.headers['content-type'] || '');
      let buffer: Buffer;
      let filename = 'upload.bin';
      let mimeHint = 'application/octet-stream';
      let category: string = 'chat_media';

      if (/multipart\/form-data/i.test(contentTypeHeader)) {
        const raw = await readRequestRawBody(req, 26 * 1024 * 1024);
        const parsed = parseMultipartFormData(raw, contentTypeHeader);
        if (!parsed.file?.buffer?.length) {
          return res.status(400).json({ success: false, error: 'file field is required' });
        }
        buffer = parsed.file.buffer;
        filename = String(parsed.fields.filename || parsed.file.filename || 'upload.bin').trim() || 'upload.bin';
        mimeHint =
          String(parsed.fields.contentType || parsed.file.contentType || 'application/octet-stream') ||
          'application/octet-stream';
        category = String(parsed.fields.category || 'chat_media');
      } else {
        const { filename: bodyFilename, contentType, base64Data, category: bodyCategory } = req.body || {};
        if (!base64Data) {
          return res.status(400).json({ success: false, error: 'multipart file or base64Data is required' });
        }

        const categoryHint = isAllowedUploadCategory(bodyCategory) ? bodyCategory : 'chat_media';
        const maxBytes = getCategoryMaxBytes(categoryHint);
        if (String(base64Data).length > maxBytes * 2 + 512) {
          throw new StorageValidationError('Base64 payload exceeds allowed size', 400, 'BASE64_TOO_LARGE', {
            maxBytes,
          });
        }

        const matches = String(base64Data).match(/^data:([A-Za-z0-9.+\/-]+);base64,(.+)$/);
        let mimeFromDataUrl = '';
        if (matches) {
          mimeFromDataUrl = matches[1];
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(String(base64Data), 'base64');
        }
        filename = String(bodyFilename || 'upload.jpg').trim() || 'upload.jpg';
        mimeHint = contentType || mimeFromDataUrl || 'image/jpeg';
        category = bodyCategory || 'chat_media';
      }

      if (!buffer.length) {
        return res.status(400).json({ success: false, error: 'Uploaded file payload is empty' });
      }

      const validated = validateUploadRequest({
        filename,
        contentType: mimeHint,
        fileSize: buffer.length,
        category,
        ownerUserId,
      });

      if (!isR2Configured() && !isMockStorageAllowed()) {
        throw new StorageNotConfiguredError();
      }

      const publicUrl = await uploadBufferToR2ServerSide(
        validated.storageKey,
        buffer,
        validated.contentType,
        {
          'uploader-user-id': validated.ownerUserId,
          'media-category': validated.category,
        }
      );

      return res.json({
        success: true,
        publicUrl,
        storageKey: validated.storageKey,
        fileSize: buffer.length,
        contentType: validated.contentType,
        isMock: !isR2Configured(),
      });
    } catch (err: any) {
      return sendStorageError(res, err);
    }
  });

  // Authenticated delete of owned R2 objects (gallery photo/video remove)
  router.post('/delete', requireAuth, async (req, res) => {
    try {
      const ownerUserId = resolveUploadOwnerUserId(req);
      if (!ownerUserId) {
        return res.status(401).json({ success: false, error: 'Authenticated user is required' });
      }
      const admin = isAdminRequest(req);
      const body = req.body || {};
      const rawKeys: string[] = [];
      if (Array.isArray(body.keys)) rawKeys.push(...body.keys.map(String));
      if (body.key) rawKeys.push(String(body.key));
      if (body.url) {
        const fromUrl = tryExtractR2ObjectKeyFromUrl(body.url);
        if (fromUrl) rawKeys.push(fromUrl);
      }
      if (Array.isArray(body.urls)) {
        for (const u of body.urls) {
          const fromUrl = tryExtractR2ObjectKeyFromUrl(u);
          if (fromUrl) rawKeys.push(fromUrl);
        }
      }

      const uniqueKeys = [...new Set(rawKeys.map((k) => String(k || '').trim()).filter(Boolean))];
      if (!uniqueKeys.length) {
        return res.status(400).json({
          success: false,
          error: 'key, keys, url, or urls required',
          code: 'MISSING_KEY',
        });
      }

      const resolved: string[] = [];
      for (const raw of uniqueKeys) {
        const key = sanitizeMediaObjectKey(raw);
        const { category, ownerUserId: keyOwner } = parseMediaKeyParts(key);
        if (!USER_DELETABLE_CATEGORIES.has(category) && !admin) {
          throw new StorageValidationError(
            `Category "${category}" cannot be deleted by users`,
            403,
            'CATEGORY_NOT_DELETABLE'
          );
        }
        if (!admin && String(keyOwner) !== String(ownerUserId)) {
          throw new StorageValidationError(
            'Not authorized to delete this media object',
            403,
            'KEY_OWNER_MISMATCH'
          );
        }
        resolved.push(key);
      }

      if (!isR2Configured() && !isMockStorageAllowed()) {
        throw new StorageNotConfiguredError();
      }

      if (!isR2Configured() && isMockStorageAllowed()) {
        // Local mock: nothing durable to delete; report success for UI flow.
        return res.json({
          success: true,
          deletedKeys: resolved,
          deletedCount: resolved.length,
          isMock: true,
        });
      }

      const result = await deleteObjectsByKeys(resolved);
      return res.json({
        success: true,
        deletedKeys: result.deletedKeys,
        deletedCount: result.deletedCount,
      });
    } catch (err: any) {
      return sendStorageError(res, err);
    }
  });

  // Proxy media streaming — allowlisted uploads/ keys only
  router.get('/media', async (req, res) => {
    try {
      let key: string;
      try {
        key = sanitizeMediaObjectKey(req.query.key);
      } catch (err) {
        return sendStorageError(res, err);
      }

      const { category, ownerUserId } = parseMediaKeyParts(key);

      if (PRIVATE_MEDIA_CATEGORIES.has(category)) {
        await tryAttachAuth(req);
        const requesterId = resolveUploadOwnerUserId(req);
        if (!requesterId) {
          return sendUnauthorized(res, 'Authentication required for private media.');
        }
        const admin = isAdminRequest(req);
        if (!admin && requesterId !== ownerUserId) {
          return sendForbidden(res, 'Not authorized to access this media object.');
        }
      } else if (!PUBLIC_MEDIA_CATEGORIES.has(category)) {
        return res.status(400).send('Media category not allowed');
      }

      const streamData = await getR2ObjectStream(key);
      if (!streamData) {
        return res.status(404).send('Media object not found in storage');
      }

      const contentType = streamData.contentType || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      // Private media: shorter cache; public: long immutable CDN-style cache
      if (PRIVATE_MEDIA_CATEGORIES.has(category)) {
        res.setHeader('Cache-Control', 'private, max-age=3600');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }

      const body = streamData.body;
      if (Buffer.isBuffer(body)) {
        const total = Number(streamData.contentLength) || body.length;
        const rangeHeader = String(req.headers.range || '').trim();
        // HTML5 <video> on mobile often requires HTTP Range (206) to show a preview.
        if (rangeHeader && /^bytes=/.test(rangeHeader)) {
          const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
          if (m) {
            let start = m[1] === '' ? 0 : parseInt(m[1], 10);
            let end = m[2] === '' ? total - 1 : parseInt(m[2], 10);
            if (!Number.isFinite(start) || start < 0) start = 0;
            if (!Number.isFinite(end) || end >= total) end = total - 1;
            if (start > end || start >= total) {
              res.status(416);
              res.setHeader('Content-Range', `bytes */${total}`);
              return res.end();
            }
            const slice = body.subarray(start, end + 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
            res.setHeader('Content-Length', String(slice.length));
            return res.send(slice);
          }
        }
        res.setHeader('Content-Length', String(total));
        return res.send(body);
      } else if (body && typeof (body as any).pipe === 'function') {
        if (streamData.contentLength) {
          res.setHeader('Content-Length', streamData.contentLength.toString());
        }
        return (body as any).pipe(res);
      } else {
        if (streamData.contentLength) {
          res.setHeader('Content-Length', streamData.contentLength.toString());
        }
        return res.send(body);
      }
    } catch (err: any) {
      console.error('[Storage Media Proxy] Error streaming key:', err);
      return res.status(500).send('Internal media streaming error');
    }
  });

  // Mock / Simulated binary PUT — auth + owner-gated; disabled when R2 configured / prod fail-closed
  router.put(
    '/mock-upload',
    (req, res, next) => {
      if (!isMockStorageAllowed()) {
        return res.status(404).json({
          success: false,
          error: 'Mock storage is disabled. Configure Cloudflare R2 or set ALLOW_MOCK_STORAGE=true in non-R2 environments.',
          code: 'MOCK_STORAGE_DISABLED',
        });
      }
      return next();
    },
    express.raw({ type: '*/*', limit: '50mb' }),
    requireAuth,
    (req, res) => {
      try {
        const ownerUserId = resolveUploadOwnerUserId(req);
        if (!ownerUserId) {
          return res.status(401).json({ success: false, error: 'Authenticated user is required' });
        }

        const key = sanitizeMediaObjectKey(req.query.key);
        assertUploadKeyOwnedByUser(key, ownerUserId);

        const { category } = parseMediaKeyParts(key);
        if (!isAllowedUploadCategory(category)) {
          throw new StorageValidationError('Invalid upload category in key', 400, 'INVALID_CATEGORY');
        }

        const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
        if (!buffer.length) {
          throw new StorageValidationError('Empty upload body', 400, 'EMPTY_BODY');
        }

        const maxBytes = getCategoryMaxBytes(category);
        if (buffer.length > maxBytes) {
          throw new StorageValidationError(
            `File exceeds max size for "${category}" (${maxBytes} bytes)`,
            400,
            'FILE_TOO_LARGE',
            { maxBytes }
          );
        }

        const contentType = normalizeContentType(req.headers['content-type'] || 'image/jpeg');
        const allowedMimes = getCategoryAllowedMimes(category);
        if (!allowedMimes.includes(contentType)) {
          throw new StorageValidationError(
            `Content-Type "${contentType}" is not allowed for category "${category}"`,
            400,
            'INVALID_MIME',
            { allowedMimes }
          );
        }

        saveLocalMediaBuffer(key, buffer, contentType);
        return res.status(200).json({ success: true, key, isMock: true });
      } catch (err: any) {
        return sendStorageError(res, err);
      }
    }
  );

  // Fetch R2 credentials & status (masked for security)
  router.get('/config', requireAdmin, (req, res) => {
    const cfg = getR2RuntimeConfig();
    const configured = isR2Configured();
    const mockStorageActive = isMockStorageAllowed();
    return res.json({
      configured,
      mockStorageActive,
      allowMockStorageEnv: String(process.env.ALLOW_MOCK_STORAGE || '').trim() === 'true',
      accountId: cfg.accountId ? `${cfg.accountId.slice(0, 4)}...${cfg.accountId.slice(-4)}` : '',
      accessKeyId: cfg.accessKeyId ? `${cfg.accessKeyId.slice(0, 4)}...${cfg.accessKeyId.slice(-4)}` : '',
      bucketName: cfg.bucketName,
      publicUrl: cfg.publicUrl,
    });
  });

  // Update R2 credentials at runtime
  router.post('/config', requireAdmin, (req, res) => {
    try {
      const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = req.body || {};
      updateR2RuntimeConfig({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucketName,
        publicUrl,
      });
      return res.json({ success: true, message: 'Cloudflare R2 runtime credentials updated.' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Test Cloudflare R2 live connectivity
  router.post('/test', requireAdmin, async (req, res) => {
    try {
      const result = await testR2Connectivity(req.body);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST Test Cloudflare R2 Bucket Connection
  router.post('/test-connection', requireAdmin, async (req, res) => {
    try {
      const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = req.body || {};
      const isMasked = (v: unknown) =>
        typeof v === 'string' && (v.startsWith('••••') || v.includes('…'));
      const hasRealOverride =
        (accountId && !isMasked(accountId)) ||
        (accessKeyId && !isMasked(accessKeyId)) ||
        (secretAccessKey && !isMasked(secretAccessKey)) ||
        Boolean(bucketName);

      const overrideConfig = hasRealOverride
        ? {
            accountId: isMasked(accountId) ? undefined : accountId,
            accessKeyId: isMasked(accessKeyId) ? undefined : accessKeyId,
            secretAccessKey: isMasked(secretAccessKey) ? undefined : secretAccessKey,
            bucketName,
            publicUrl,
          }
        : undefined;

      const result = await testR2Connectivity(overrideConfig);
      return res.json({ ...result, source: overrideConfig ? 'override' : 'environment' });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Error testing Cloudflare R2 connectivity',
      });
    }
  });

  return router;
}
