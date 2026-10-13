import type { NextRequest } from 'next/server';
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
} from '../../server/r2Storage';
import { jsonErr, requireAuth, type AuthOk } from '../nextAuth';
import { parseJsonBody } from '../nextRequest';

const USER_DELETABLE_CATEGORIES = new Set([
  'gallery',
  'gallery_video',
  'avatar',
  'moment',
  'intro_video',
  'chat_media',
]);

export function storageJsonError(err: unknown): Response {
  if (err instanceof StorageNotConfiguredError) {
    return Response.json(
      {
        success: false,
        configured: false,
        error: err.message,
        code: err.code,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (err instanceof StorageValidationError) {
    return Response.json(
      {
        success: false,
        error: err.message,
        code: err.code,
        ...(err.details || {}),
      },
      { status: err.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const message = err instanceof Error ? err.message : 'Storage error';
  console.error('[Storage API] Unexpected error:', err);
  return Response.json({ success: false, error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}

export async function softAuth(req: NextRequest): Promise<AuthOk | null> {
  const auth = await requireAuth(req);
  return auth.ok ? auth : null;
}

function isAdminAuth(auth: AuthOk): boolean {
  return auth.role === 'admin';
}

/** POST /api/storage/presigned-url */
export async function handlePresignedUrl(req: NextRequest, auth: AuthOk) {
  const parsed = await parseJsonBody<{
    filename?: string;
    contentType?: string;
    fileSize?: number;
    category?: string;
  }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

  const { filename, contentType, fileSize, category } = parsed.data || {};
  if (!filename) {
    return Response.json({ success: false, error: 'Filename is required' }, { status: 400 });
  }

  const ownerUserId = auth.profileId;
  if (!ownerUserId) {
    return Response.json(
      { success: false, error: 'Authenticated user is required for storage uploads' },
      { status: 401 }
    );
  }

  const data = await generateR2PresignedUploadUrl({
    filename,
    contentType: contentType || '',
    fileSize: Number(fileSize) || 0,
    userId: ownerUserId,
    category: category || 'chat_media',
  });
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

/** POST /api/storage/upload */
export async function handleStorageUpload(req: NextRequest, auth: AuthOk) {
  const ownerUserId = auth.profileId;
  if (!ownerUserId) {
    return Response.json(
      { success: false, error: 'Authenticated user is required for storage uploads' },
      { status: 401 }
    );
  }

  const contentTypeHeader = String(req.headers.get('content-type') || '');
  let buffer: Buffer;
  let filename = 'upload.bin';
  let mimeHint = 'application/octet-stream';
  let category: string = 'chat_media';

  if (/multipart\/form-data/i.test(contentTypeHeader)) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) {
      return Response.json({ success: false, error: 'file field is required' }, { status: 400 });
    }
    const maxRead = 26 * 1024 * 1024;
    if (file.size > maxRead) {
      throw new StorageValidationError(`File exceeds max upload size (${maxRead} bytes)`, 413, 'FILE_TOO_LARGE', {
        maxBytes: maxRead,
      });
    }
    buffer = Buffer.from(await file.arrayBuffer());
    filename = String(form.get('filename') || (file as File).name || 'upload.bin').trim() || 'upload.bin';
    mimeHint =
      String(form.get('contentType') || file.type || 'application/octet-stream') || 'application/octet-stream';
    category = String(form.get('category') || 'chat_media');
  } else {
    const parsed = await parseJsonBody<{
      filename?: string;
      contentType?: string;
      base64Data?: string;
      category?: string;
    }>(req, { large: true });
    if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

    const { filename: bodyFilename, contentType, base64Data, category: bodyCategory } = parsed.data || {};
    if (!base64Data) {
      return Response.json({ success: false, error: 'multipart file or base64Data is required' }, { status: 400 });
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
    return Response.json({ success: false, error: 'Uploaded file payload is empty' }, { status: 400 });
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

  const publicUrl = await uploadBufferToR2ServerSide(validated.storageKey, buffer, validated.contentType, {
    'uploader-user-id': validated.ownerUserId,
    'media-category': validated.category,
  });

  return Response.json(
    {
      success: true,
      publicUrl,
      storageKey: validated.storageKey,
      fileSize: buffer.length,
      contentType: validated.contentType,
      isMock: !isR2Configured(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** POST /api/storage/delete */
export async function handleStorageDelete(req: NextRequest, auth: AuthOk) {
  const ownerUserId = auth.profileId;
  if (!ownerUserId) {
    return Response.json({ success: false, error: 'Authenticated user is required' }, { status: 401 });
  }
  const admin = isAdminAuth(auth);
  const parsed = await parseJsonBody<{ key?: string; keys?: string[]; url?: string; urls?: string[] }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

  const body = parsed.data || {};
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
    return Response.json({
      success: false,
      error: 'key, keys, url, or urls required',
      code: 'MISSING_KEY',
    }, { status: 400 });
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
      throw new StorageValidationError('Not authorized to delete this media object', 403, 'KEY_OWNER_MISMATCH');
    }
    resolved.push(key);
  }

  if (!isR2Configured() && !isMockStorageAllowed()) {
    throw new StorageNotConfiguredError();
  }

  if (!isR2Configured() && isMockStorageAllowed()) {
    return Response.json({
      success: true,
      deletedKeys: resolved,
      deletedCount: resolved.length,
      isMock: true,
    });
  }

  const result = await deleteObjectsByKeys(resolved);
  return Response.json({
    success: true,
    deletedKeys: result.deletedKeys,
    deletedCount: result.deletedCount,
  });
}

/** GET /api/storage/media?key= */
export async function handleStorageMedia(req: NextRequest) {
  const url = new URL(req.url);
  let key: string;
  try {
    key = sanitizeMediaObjectKey(url.searchParams.get('key'));
  } catch (err) {
    return storageJsonError(err);
  }

  const { category, ownerUserId } = parseMediaKeyParts(key);

  if (PRIVATE_MEDIA_CATEGORIES.has(category)) {
    const auth = await softAuth(req);
    if (!auth?.profileId) {
      return jsonErr(401, 'Authentication required for private media.', 'UNAUTHORIZED');
    }
    const admin = isAdminAuth(auth);
    if (!admin && auth.profileId !== ownerUserId) {
      return jsonErr(403, 'Not authorized to access this media object.', 'FORBIDDEN');
    }
  } else if (!PUBLIC_MEDIA_CATEGORIES.has(category)) {
    return new Response('Media category not allowed', { status: 400 });
  }

  const streamData = await getR2ObjectStream(key);
  if (!streamData) {
    return new Response('Media object not found in storage', { status: 404 });
  }

  const contentType = streamData.contentType || 'application/octet-stream';
  const cacheControl = PRIVATE_MEDIA_CATEGORIES.has(category)
    ? 'private, max-age=3600'
    : 'public, max-age=31536000, immutable';

  const body = streamData.body;
  if (Buffer.isBuffer(body)) {
    const total = Number(streamData.contentLength) || body.length;
    const rangeHeader = String(req.headers.get('range') || '').trim();
    if (rangeHeader && /^bytes=/.test(rangeHeader)) {
      const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
      if (m) {
        let start = m[1] === '' ? 0 : parseInt(m[1], 10);
        let end = m[2] === '' ? total - 1 : parseInt(m[2], 10);
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= total) end = total - 1;
        if (start > end || start >= total) {
          return new Response(null, {
            status: 416,
            headers: {
              'Content-Range': `bytes */${total}`,
              'Accept-Ranges': 'bytes',
            },
          });
        }
        const slice = body.subarray(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': String(slice.length),
            'Cache-Control': cacheControl,
          },
        });
      }
    }
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
        'Cache-Control': cacheControl,
      },
    });
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
  };
  if (streamData.contentLength) {
    headers['Content-Length'] = streamData.contentLength.toString();
  }
  return new Response(body as BodyInit, { status: 200, headers });
}

/** PUT /api/storage/mock-upload?key= */
export async function handleMockUpload(req: NextRequest, auth: AuthOk) {
  if (!isMockStorageAllowed()) {
    return Response.json(
      {
        success: false,
        error:
          'Mock storage is disabled. Configure Cloudflare R2 or set ALLOW_MOCK_STORAGE=true in non-R2 environments.',
        code: 'MOCK_STORAGE_DISABLED',
      },
      { status: 404 }
    );
  }

  const ownerUserId = auth.profileId;
  if (!ownerUserId) {
    return Response.json({ success: false, error: 'Authenticated user is required' }, { status: 401 });
  }

  const url = new URL(req.url);
  const key = sanitizeMediaObjectKey(url.searchParams.get('key'));
  assertUploadKeyOwnedByUser(key, ownerUserId);

  const { category } = parseMediaKeyParts(key);
  if (!isAllowedUploadCategory(category)) {
    throw new StorageValidationError('Invalid upload category in key', 400, 'INVALID_CATEGORY');
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) {
    throw new StorageValidationError('Empty upload body', 400, 'EMPTY_BODY');
  }

  const maxBytes = getCategoryMaxBytes(category);
  if (buf.length > maxBytes) {
    throw new StorageValidationError(
      `File exceeds max size for "${category}" (${maxBytes} bytes)`,
      400,
      'FILE_TOO_LARGE',
      { maxBytes }
    );
  }

  const ct = normalizeContentType(req.headers.get('content-type') || 'image/jpeg');
  const allowedMimes = getCategoryAllowedMimes(category);
  if (!allowedMimes.includes(ct)) {
    throw new StorageValidationError(
      `Content-Type "${ct}" is not allowed for category "${category}"`,
      400,
      'INVALID_MIME',
      { allowedMimes }
    );
  }

  saveLocalMediaBuffer(key, buf, ct);
  return Response.json({ success: true, key, isMock: true });
}

export function handleStorageConfigGet() {
  const cfg = getR2RuntimeConfig();
  const configured = isR2Configured();
  const mockStorageActive = isMockStorageAllowed();
  return Response.json({
    configured,
    mockStorageActive,
    allowMockStorageEnv: String(process.env.ALLOW_MOCK_STORAGE || '').trim() === 'true',
    accountId: cfg.accountId ? `${cfg.accountId.slice(0, 4)}...${cfg.accountId.slice(-4)}` : '',
    accessKeyId: cfg.accessKeyId ? `${cfg.accessKeyId.slice(0, 4)}...${cfg.accessKeyId.slice(-4)}` : '',
    bucketName: cfg.bucketName,
    publicUrl: cfg.publicUrl,
  });
}

export async function handleStorageConfigPost(req: NextRequest) {
  const parsed = await parseJsonBody<{
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    publicUrl?: string;
  }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

  const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = parsed.data || {};
  updateR2RuntimeConfig({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl,
  });
  return Response.json({ success: true, message: 'Cloudflare R2 runtime credentials updated.' });
}

export async function handleStorageTest(req: NextRequest) {
  const parsed = await parseJsonBody<Record<string, unknown>>(req);
  const body = parsed.ok ? parsed.data : {};
  const result = await testR2Connectivity(body as any);
  return Response.json(result);
}

export async function handleStorageTestConnection(req: NextRequest) {
  const parsed = await parseJsonBody<{
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    publicUrl?: string;
  }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

  const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = parsed.data || {};
  const isMasked = (v: unknown) => typeof v === 'string' && (v.startsWith('••••') || v.includes('…'));
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
  return Response.json({ ...result, source: overrideConfig ? 'override' : 'environment' });
}
