import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

try {
  // Optional local .env — never crash serverless cold-start if dotenv is unavailable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config();
} catch {
  /* ignore */
}

export interface R2CredentialsConfig {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicUrl?: string;
}

// Global active credentials cache
let activeConfig: R2CredentialsConfig = {};

// In-memory media cache for instant, persistent uploads and fallback serving
const localMediaCache = new Map<string, { buffer: Buffer; contentType: string; lastModified: Date }>();

export function saveLocalMediaBuffer(key: string, buffer: Buffer, contentType: string) {
  localMediaCache.set(key, {
    buffer,
    contentType: contentType || 'image/jpeg',
    lastModified: new Date(),
  });
}

export function getLocalMediaBuffer(key: string): { buffer: Buffer; contentType: string; lastModified: Date } | null {
  return localMediaCache.get(key) || null;
}

// Helper to resolve public CDN URL or fallback to backend proxy streaming
export function resolvePublicMediaUrl(publicUrlConfig: string | undefined, key: string): string {
  const clean = (publicUrlConfig || '').trim().replace(/\/$/, '');
  // .r2.cloudflarestorage.com is the S3 API endpoint requiring authentication, NOT a public CDN domain.
  const isRawS3Endpoint = clean.includes('.r2.cloudflarestorage.com');
  const isPublicDomain = Boolean(clean && (clean.startsWith('http://') || clean.startsWith('https://')) && !isRawS3Endpoint);

  if (isPublicDomain) {
    return `${clean}/${key}`;
  }
  return `/api/storage/media?key=${encodeURIComponent(key)}`;
}

// Upload buffer directly to Cloudflare R2 from backend server
export async function uploadBufferToR2ServerSide(
  key: string,
  buffer: Buffer,
  contentType: string,
  metadata?: Record<string, string>,
  customConfig?: R2CredentialsConfig
): Promise<string> {
  const cfg = customConfig || getR2RuntimeConfig();
  const bucketName = cfg.bucketName || 'livecall-media-storage';

  // Always cache locally so it can be served instantly
  saveLocalMediaBuffer(key, buffer, contentType);

  if (isR2Configured(cfg)) {
    const client = getR2Client(cfg);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: metadata,
    });
    await client.send(command);
  }

  return resolvePublicMediaUrl(cfg.publicUrl, key);
}

export function updateR2RuntimeConfig(newConfig: Partial<R2CredentialsConfig>) {
  activeConfig = {
    ...activeConfig,
    ...newConfig,
  };
  s3Client = null; // Invalidate cached S3 client instance
}

export function getR2RuntimeConfig(): R2CredentialsConfig {
  const clean = (v: string) => String(v || '').trim().replace(/^["']|["']$/g, '');
  return {
    accountId: clean(activeConfig.accountId || process.env.R2_ACCOUNT_ID || ''),
    accessKeyId: clean(activeConfig.accessKeyId || process.env.R2_ACCESS_KEY_ID || ''),
    secretAccessKey: clean(activeConfig.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY || ''),
    bucketName: clean(activeConfig.bucketName || process.env.R2_BUCKET_NAME || 'livecall-media-storage') || 'livecall-media-storage',
    publicUrl: clean(activeConfig.publicUrl || process.env.R2_PUBLIC_URL || '').replace(/\/$/, ''),
  };
}

let s3Client: S3Client | null = null;

export function isR2Configured(configOverride?: R2CredentialsConfig): boolean {
  const cfg = { ...getR2RuntimeConfig(), ...(configOverride || {}) };
  const acc = (cfg.accountId || '').trim();
  const key = (cfg.accessKeyId || '').trim();
  const sec = (cfg.secretAccessKey || '').trim();
  return Boolean(
    acc &&
    key &&
    sec &&
    !acc.includes('your-') &&
    !key.includes('your-')
  );
}

/** Upload categories accepted for new writes (presign + server upload). */
export const STORAGE_UPLOAD_CATEGORIES = [
  'avatar',
  'gallery',
  'gallery_video',
  'chat_media',
  'moment',
  'verification',
  'intro_video',
] as const;

export type StorageUploadCategory = (typeof STORAGE_UPLOAD_CATEGORIES)[number];

/** Categories readable without auth via GET /media (world-readable by design / img tags). */
export const PUBLIC_MEDIA_CATEGORIES = new Set([
  'avatar',
  'gallery',
  'gallery_video',
  'moment',
  'intro_video',
  'chat_media',
  'media',
]);

/**
 * Categories that require auth + ownership/admin on GET /media.
 * Note: chat_media stays proxy-readable so <img>/<video> tags work without Bearer headers;
 * objects are still unguessable under uploads/chat_media/{userId}/...
 */
export const PRIVATE_MEDIA_CATEGORIES = new Set(['verification']);

const CATEGORY_MAX_BYTES: Record<StorageUploadCategory, number> = {
  avatar: 5 * 1024 * 1024,
  gallery: 10 * 1024 * 1024,
  gallery_video: 100 * 1024 * 1024,
  moment: 10 * 1024 * 1024,
  chat_media: 10 * 1024 * 1024,
  verification: 15 * 1024 * 1024,
  intro_video: 50 * 1024 * 1024,
};

const CATEGORY_ALLOWED_MIMES: Record<StorageUploadCategory, readonly string[]> = {
  avatar: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  gallery: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  gallery_video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'],
  moment: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
  chat_media: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/webm',
  ],
  verification: ['image/jpeg', 'image/png', 'image/webp'],
  intro_video: ['video/mp4', 'video/webm', 'video/quicktime'],
};

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov'],
  'video/x-m4v': ['m4v'],
  'audio/mpeg': ['mp3', 'mpeg'],
  'audio/mp4': ['m4a', 'mp4'],
  'audio/webm': ['webm'],
};

const SAFE_USER_ID_RE = /^[A-Za-z0-9_-]+$/;
const MEDIA_KEY_RE =
  /^uploads\/(avatar|gallery|gallery_video|chat_media|moment|verification|intro_video|media)\/[A-Za-z0-9_-]+\//;

export class StorageValidationError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, status = 400, code = 'STORAGE_VALIDATION', details?: Record<string, unknown>) {
    super(message);
    this.name = 'StorageValidationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class StorageNotConfiguredError extends StorageValidationError {
  constructor(message = 'Storage not configured') {
    super(message, 503, 'STORAGE_NOT_CONFIGURED', { configured: false });
    this.name = 'StorageNotConfiguredError';
  }
}

/**
 * Mock/local upload path is allowed only when R2 is not configured and either:
 * - ALLOW_MOCK_STORAGE=true, or
 * - non-production NODE_ENV
 */
export function isMockStorageAllowed(configOverride?: R2CredentialsConfig): boolean {
  if (isR2Configured(configOverride)) return false;
  if (String(process.env.ALLOW_MOCK_STORAGE || '').trim() === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export function isAllowedUploadCategory(category: unknown): category is StorageUploadCategory {
  return typeof category === 'string' && (STORAGE_UPLOAD_CATEGORIES as readonly string[]).includes(category);
}

export function getCategoryMaxBytes(category: StorageUploadCategory): number {
  return CATEGORY_MAX_BYTES[category];
}

export function getCategoryAllowedMimes(category: StorageUploadCategory): readonly string[] {
  return CATEGORY_ALLOWED_MIMES[category];
}

export function normalizeContentType(contentType: unknown): string {
  return String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

export function sanitizeUploadFilename(filename: unknown): string {
  const raw = String(filename || 'upload.bin').trim();
  const base = raw.split(/[/\\]/).pop() || 'upload.bin';
  return base.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 180) || 'upload.bin';
}

export function sanitizeOwnerUserId(userId: unknown): string {
  const id = String(userId || '').trim();
  if (!id || !SAFE_USER_ID_RE.test(id) || id.includes('..')) {
    throw new StorageValidationError('Invalid upload owner user id', 400, 'INVALID_OWNER');
  }
  return id;
}

function extensionForFilename(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1] || '';
}

export function validateUploadMimeAndExtension(
  category: StorageUploadCategory,
  contentType: string,
  filename: string
): string {
  const mime = normalizeContentType(contentType);
  const allowed = CATEGORY_ALLOWED_MIMES[category];
  if (!allowed) {
    throw new StorageValidationError(
      `Unknown upload category "${category}"`,
      400,
      'INVALID_CATEGORY'
    );
  }
  if (!mime || !allowed.includes(mime)) {
    throw new StorageValidationError(
      `Content-Type "${mime || '(empty)'}" is not allowed for category "${category}"`,
      400,
      'INVALID_MIME',
      { allowedMimes: [...allowed] }
    );
  }

  const ext = extensionForFilename(filename);
  const allowedExts = MIME_EXTENSIONS[mime];
  if (ext && allowedExts && !allowedExts.includes(ext)) {
    throw new StorageValidationError(
      `File extension ".${ext}" does not match Content-Type "${mime}"`,
      400,
      'INVALID_EXTENSION'
    );
  }
  return mime;
}

export function validateUploadFileSize(category: StorageUploadCategory, fileSize: number): number {
  const size = Number(fileSize);
  if (!Number.isFinite(size) || size <= 0) {
    throw new StorageValidationError('fileSize must be a positive number', 400, 'INVALID_FILE_SIZE');
  }
  const max = CATEGORY_MAX_BYTES[category];
  if (!max) {
    throw new StorageValidationError(
      `Unknown upload category "${category}"`,
      400,
      'INVALID_CATEGORY'
    );
  }
  if (size > max) {
    throw new StorageValidationError(
      `File exceeds max size for "${category}" (${max} bytes)`,
      400,
      'FILE_TOO_LARGE',
      { maxBytes: max }
    );
  }
  return size;
}

/**
 * Reject path traversal / absolute / protocol keys. Valid keys match:
 * uploads/{category}/{userId}/...
 */
export function sanitizeMediaObjectKey(rawKey: unknown): string {
  const key = String(rawKey || '').trim();
  if (!key) {
    throw new StorageValidationError('Missing media key', 400, 'MISSING_KEY');
  }
  if (
    key.includes('..') ||
    key.includes('\\') ||
    key.includes('\0') ||
    key.startsWith('/') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(key) ||
    key.includes('://')
  ) {
    throw new StorageValidationError('Invalid media key', 400, 'INVALID_KEY');
  }
  if (!key.startsWith('uploads/') || !MEDIA_KEY_RE.test(key)) {
    throw new StorageValidationError('Media key outside allowlisted uploads prefix', 400, 'KEY_NOT_ALLOWED');
  }
  return key;
}

export function parseMediaKeyParts(key: string): {
  category: string;
  ownerUserId: string;
} {
  const safe = sanitizeMediaObjectKey(key);
  const parts = safe.split('/');
  return {
    category: parts[1] || '',
    ownerUserId: parts[2] || '',
  };
}

export function assertUploadKeyOwnedByUser(key: string, ownerUserId: string): void {
  const parts = parseMediaKeyParts(key);
  const expectedPrefix = `uploads/${parts.category}/${ownerUserId}/`;
  if (!key.startsWith(expectedPrefix) || parts.ownerUserId !== ownerUserId) {
    throw new StorageValidationError('Storage key owner mismatch', 403, 'KEY_OWNER_MISMATCH');
  }
  if (!isAllowedUploadCategory(parts.category) && parts.category !== 'media') {
    throw new StorageValidationError('Invalid storage category in key', 400, 'INVALID_CATEGORY');
  }
}

export function buildOwnedStorageKey(params: {
  category: StorageUploadCategory;
  ownerUserId: string;
  filename: string;
}): string {
  const ownerUserId = sanitizeOwnerUserId(params.ownerUserId);
  const cleanName = sanitizeUploadFilename(params.filename);
  const uniquePrefix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  return `uploads/${params.category}/${ownerUserId}/${uniquePrefix}_${cleanName}`;
}

export function validateUploadRequest(params: {
  filename: unknown;
  contentType: unknown;
  fileSize: unknown;
  category: unknown;
  ownerUserId: unknown;
}): {
  filename: string;
  contentType: string;
  fileSize: number;
  category: StorageUploadCategory;
  ownerUserId: string;
  storageKey: string;
} {
  if (!isAllowedUploadCategory(params.category)) {
    throw new StorageValidationError(
      `Invalid category. Allowed: ${STORAGE_UPLOAD_CATEGORIES.join(', ')}`,
      400,
      'INVALID_CATEGORY'
    );
  }
  const category = params.category;
  const filename = sanitizeUploadFilename(params.filename);
  const contentType = validateUploadMimeAndExtension(category, String(params.contentType || ''), filename);
  const fileSize = validateUploadFileSize(category, Number(params.fileSize));
  const ownerUserId = sanitizeOwnerUserId(params.ownerUserId);
  const storageKey = buildOwnedStorageKey({ category, ownerUserId, filename });
  return { filename, contentType, fileSize, category, ownerUserId, storageKey };
}

export function getR2Client(configOverride?: R2CredentialsConfig): S3Client {
  const cfg = { ...getR2RuntimeConfig(), ...(configOverride || {}) };
  const acc = (cfg.accountId || '').trim();
  const key = (cfg.accessKeyId || '').trim();
  const sec = (cfg.secretAccessKey || '').trim();

  if (!acc || !key || !sec) {
    throw new Error('Cloudflare R2 credentials (Account ID, Access Key ID, and Secret Access Key) are not fully configured.');
  }

  // If using overrides or no cached client, instantiate
  return new S3Client({
    region: 'auto',
    endpoint: `https://${acc}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: key,
      secretAccessKey: sec,
    },
  });
}

// Test live R2 connectivity by pinging the bucket
export async function testR2Connectivity(customConfig?: R2CredentialsConfig): Promise<{
  success: boolean;
  message: string;
  bucket: string;
  endpoint: string;
  latencyMs: number;
  corsHelp?: string;
}> {
  const startTime = performance.now();
  const cfg = { ...getR2RuntimeConfig(), ...(customConfig || {}) };
  const bucket = cfg.bucketName || 'livecall-media-storage';
  const accountId = cfg.accountId || '';

  if (!isR2Configured(cfg)) {
    return {
      success: false,
      message: 'Cloudflare R2 credentials are incomplete. Please provide Account ID, Access Key ID, and Secret Access Key.',
      bucket,
      endpoint: `https://${accountId || 'unknown'}.r2.cloudflarestorage.com`,
      latencyMs: 0,
    };
  }

  try {
    const client = getR2Client(cfg);
    // Ping bucket using ListObjectsV2Command with MaxKeys=1 to check bucket access & auth
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1,
    });
    await client.send(command);

    const latencyMs = Math.round(performance.now() - startTime);
    return {
      success: true,
      message: `Cloudflare R2 Bucket "${bucket}" is connected and fully reachable via S3 API.`,
      bucket,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    let errMsg = err.message || 'Unknown R2 connection error';
    
    if (err.name === 'NoSuchBucket' || errMsg.includes('NoSuchBucket') || err.$metadata?.httpStatusCode === 404) {
      errMsg = `Bucket "${bucket}" was not found in Cloudflare R2 account "${accountId}". Please ensure you have created this bucket in Cloudflare Dashboard.`;
    } else if (err.name === 'InvalidAccessKeyId' || err.$metadata?.httpStatusCode === 403) {
      errMsg = `Authentication failed (403 Forbidden). Please check that your R2 Access Key ID and Secret Access Key have Admin/Read/Write permissions on bucket "${bucket}".`;
    }

    return {
      success: false,
      message: errMsg,
      bucket,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      latencyMs,
      corsHelp: 'Make sure CORS is enabled on your R2 bucket for direct browser uploads (AllowedOrigins: ["*"], AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"]).',
    };
  }
}

export interface PresignedUrlRequest {
  filename: string;
  contentType: string;
  fileSize: number;
  /** Always derived from authenticated profile on the route — never trust client. */
  userId: string;
  category?: StorageUploadCategory | string;
  credentialsOverride?: R2CredentialsConfig;
}

export interface PresignedUrlResponse {
  presignedUrl: string;
  publicUrl: string;
  storageKey: string;
  expiresInSeconds: number;
  bucket: string;
  method: 'PUT';
  headers: Record<string, string>;
  isMock?: boolean;
  configured?: boolean;
}

// Generate secure pre-signed PUT URL for client-direct media uploads
export async function generateR2PresignedUploadUrl(
  params: PresignedUrlRequest
): Promise<PresignedUrlResponse> {
  const validated = validateUploadRequest({
    filename: params.filename,
    contentType: params.contentType,
    fileSize: params.fileSize,
    category: params.category || 'chat_media',
    ownerUserId: params.userId,
  });

  const cfg = params.credentialsOverride || getR2RuntimeConfig();
  const bucketName = cfg.bucketName || 'livecall-media-storage';
  const { filename, contentType, fileSize, category, ownerUserId, storageKey } = validated;

  const expiresInSeconds = 900; // 15 minutes upload window

  if (!isR2Configured(cfg)) {
    if (!isMockStorageAllowed(cfg)) {
      throw new StorageNotConfiguredError(
        'Cloudflare R2 is not configured. Set R2 credentials or ALLOW_MOCK_STORAGE=true for local/dev mock uploads.'
      );
    }

    const localMediaUrl = `/api/storage/media?key=${encodeURIComponent(storageKey)}`;
    return {
      presignedUrl: `/api/storage/mock-upload?key=${encodeURIComponent(storageKey)}`,
      publicUrl: localMediaUrl,
      storageKey,
      expiresInSeconds,
      bucket: bucketName,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      isMock: true,
      configured: false,
    };
  }

  const client = getR2Client(cfg);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
    ContentType: contentType,
    ContentLength: fileSize,
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: {
      'uploader-user-id': ownerUserId,
      'media-category': category,
      'original-filename': encodeURIComponent(filename),
    },
  });

  const presignedUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  const finalPublicUrl = resolvePublicMediaUrl(cfg.publicUrl, storageKey);

  return {
    presignedUrl,
    publicUrl: finalPublicUrl,
    storageKey,
    expiresInSeconds,
    bucket: bucketName,
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    isMock: false,
    configured: true,
  };
}

// Stream media object directly from Cloudflare R2 or local cache
export async function getR2ObjectStream(key: string, credentialsOverride?: R2CredentialsConfig) {
  // Defense in depth: never fetch keys outside allowlisted uploads/ prefixes
  try {
    sanitizeMediaObjectKey(key);
  } catch {
    return null;
  }

  // 1. Check local media buffer first (for local uploads, mock mode, or immediate preview)
  const local = getLocalMediaBuffer(key);
  if (local) {
    return {
      body: local.buffer,
      contentType: local.contentType || 'image/jpeg',
      contentLength: local.buffer.length,
      etag: `"${Date.now()}"`,
      lastModified: local.lastModified,
    };
  }

  const cfg = credentialsOverride || getR2RuntimeConfig();
  const bucketName = cfg.bucketName || 'livecall-media-storage';

  if (!isR2Configured(cfg)) {
    return null;
  }

  try {
    const client = getR2Client(cfg);
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await client.send(command);
    return {
      body: response.Body,
      contentType: response.ContentType || 'image/jpeg',
      contentLength: response.ContentLength,
      etag: response.ETag,
      lastModified: response.LastModified,
    };
  } catch (err: any) {
    console.warn(`[R2 Storage] getObject error for key ${key}:`, err.message);
    return null;
  }
}

export function clearLocalMediaCache() {
  localMediaCache.clear();
}

/** Remove specific keys from the in-process media cache (used during user hard-delete). */
export function clearLocalMediaCacheKeys(keys: string[]) {
  for (const key of keys) {
    if (key) localMediaCache.delete(key);
  }
}

/** Remove all cached objects under one or more key prefixes. */
export function clearLocalMediaCacheByPrefixes(prefixes: string[]) {
  if (!prefixes.length || localMediaCache.size === 0) return;
  for (const key of Array.from(localMediaCache.keys())) {
    if (prefixes.some((p) => p && key.startsWith(p))) {
      localMediaCache.delete(key);
    }
  }
}

const USER_MEDIA_PREFIX_CATEGORIES = [
  'avatar',
  'gallery',
  'chat_media',
  'moment',
  'verification',
  'intro_video',
  'media',
] as const;

/**
 * Best-effort extract of an R2 object key from a public CDN URL or /api/storage/media?key= URL.
 * Returns null for external/Unsplash/etc. URLs (those must not be deleted).
 */
export function tryExtractR2ObjectKeyFromUrl(rawUrl: unknown): string | null {
  const url = String(rawUrl || '').trim();
  if (!url || url.startsWith('data:') || url.includes('unsplash.com') || url.includes('images.unsplash')) {
    return null;
  }

  try {
    const parsed = new URL(url, 'http://localhost');
    const keyParam = parsed.searchParams.get('key');
    if (keyParam) {
      const decoded = decodeURIComponent(keyParam).replace(/^\/+/, '');
      if (decoded.startsWith('uploads/') && MEDIA_KEY_RE.test(decoded)) return decoded;
    }
  } catch {
    // fall through
  }

  const uploadsIdx = url.indexOf('/uploads/');
  if (uploadsIdx >= 0) {
    const key = url.slice(uploadsIdx + 1).split('?')[0].split('#')[0];
    if (key.startsWith('uploads/') && MEDIA_KEY_RE.test(key)) return key;
  }

  if (url.startsWith('uploads/') && MEDIA_KEY_RE.test(url.split('?')[0])) {
    return url.split('?')[0];
  }

  const cfg = getR2RuntimeConfig();
  const publicBase = (cfg.publicUrl || '').replace(/\/$/, '');
  if (publicBase && url.startsWith(publicBase + '/')) {
    const key = url.slice(publicBase.length + 1).split('?')[0].split('#')[0];
    if (key.startsWith('uploads/') && MEDIA_KEY_RE.test(key)) return key;
  }

  return null;
}

/** Collect owned R2 object keys referenced by profile media URL fields. */
export function collectProfileMediaObjectKeys(profile: Record<string, any> | null | undefined): string[] {
  if (!profile) return [];
  const urls: unknown[] = [
    profile.avatar_url ?? profile.avatarUrl,
    profile.intro_video_url ?? profile.introVideoUrl,
    profile.verification_video_url ?? profile.verificationVideoUrl,
  ];

  const gallery = profile.gallery;
  if (Array.isArray(gallery)) urls.push(...gallery);

  const kyc = profile.kyc_documents ?? profile.kycDocuments;
  if (kyc && typeof kyc === 'object') {
    const walk = (v: unknown) => {
      if (typeof v === 'string') urls.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
    };
    walk(kyc);
  }

  const keys = new Set<string>();
  for (const u of urls) {
    const key = tryExtractR2ObjectKeyFromUrl(u);
    if (key) keys.add(key);
  }
  return Array.from(keys);
}

/** Standard per-user upload prefixes (profile id and optional auth_id). */
export function buildUserMediaPrefixes(userId: string, authId?: string | null): string[] {
  const ids = Array.from(
    new Set([String(userId || '').trim(), String(authId || '').trim()].filter(Boolean))
  );
  const prefixes: string[] = [];
  for (const id of ids) {
    for (const cat of USER_MEDIA_PREFIX_CATEGORIES) {
      prefixes.push(`uploads/${cat}/${id}/`);
    }
  }
  return prefixes;
}

/**
 * Purge all R2 objects for a user: explicit keys from profile URLs + category prefixes.
 */
export async function purgeUserMediaFromR2(params: {
  userId: string;
  authId?: string | null;
  explicitKeys?: string[];
}): Promise<{ deletedCount: number; deletedKeys: string[]; prefixes: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const prefixes = buildUserMediaPrefixes(params.userId, params.authId);
  const explicitKeys = Array.from(new Set((params.explicitKeys || []).filter(Boolean)));

  clearLocalMediaCacheByPrefixes(prefixes);
  if (explicitKeys.length) clearLocalMediaCacheKeys(explicitKeys);

  if (!isR2Configured()) {
    warnings.push('R2 not configured; skipped remote object purge (local cache cleared).');
    return { deletedCount: 0, deletedKeys: [], prefixes, warnings };
  }

  let deletedCount = 0;
  const deletedKeys: string[] = [];

  try {
    if (explicitKeys.length > 0) {
      const keyRes = await deleteObjectsByKeys(explicitKeys);
      deletedCount += keyRes.deletedCount;
      deletedKeys.push(...keyRes.deletedKeys);
    }
    const prefixRes = await purgeR2MediaUploads({ prefixes, maxReturnedKeys: 5000 });
    deletedCount += prefixRes.deletedCount;
    deletedKeys.push(...prefixRes.deletedKeys);
  } catch (err: any) {
    warnings.push(`R2 purge error: ${err?.message || String(err)}`);
    console.error('[R2 Storage] purgeUserMediaFromR2 error:', err);
  }

  return {
    deletedCount,
    deletedKeys: Array.from(new Set(deletedKeys)),
    prefixes,
    warnings,
  };
}

type R2DeleteResult = { deletedCount: number; deletedKeys: string[] };

function shouldTruncateKeys(deletedKeys: string[], maxKeys: number) {
  return deletedKeys.length > maxKeys;
}

/**
 * Delete a specific set of R2 object keys in batches (S3 DeleteObjectsCommand supports up to 1000).
 */
export async function deleteObjectsByKeys(
  keys: string[],
  opts?: { bucketName?: string; credentialsOverride?: R2CredentialsConfig; batchSize?: number; maxReturnedKeys?: number }
): Promise<R2DeleteResult> {
  const cfg = opts?.credentialsOverride || getR2RuntimeConfig();
  if (!isR2Configured(cfg)) return { deletedCount: 0, deletedKeys: [] };

  const bucketName = opts?.bucketName || cfg.bucketName || 'livecall-media-storage';
  const batchSize = opts?.batchSize || 1000;
  const maxReturnedKeys = opts?.maxReturnedKeys || 2000;

  const client = getR2Client(cfg);
  const deletedKeys: string[] = [];
  let deletedCount = 0;

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    if (batch.length === 0) continue;

    const command = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: batch.map((k) => ({ Key: k })),
        Quiet: true,
      },
    });

    const resp: any = await client.send(command);
    const errs = resp?.Errors || [];
    if (errs?.length) {
      console.warn('[R2 Storage] deleteObjectsByKeys batch errors:', errs.slice(0, 5));
    }

    deletedCount += batch.length - (errs?.length ? errs.length : 0);
    if (deletedKeys.length <= maxReturnedKeys) {
      deletedKeys.push(...batch);
      if (shouldTruncateKeys(deletedKeys, maxReturnedKeys)) {
        deletedKeys.splice(maxReturnedKeys);
      }
    }
  }

  return { deletedCount, deletedKeys };
}

/**
 * Delete all objects whose keys start with `prefix`, paginating via ListObjectsV2Command.
 */
export async function deleteObjectsByPrefix(
  prefix: string,
  opts?: { bucketName?: string; credentialsOverride?: R2CredentialsConfig; batchSize?: number; maxReturnedKeys?: number }
): Promise<R2DeleteResult> {
  const cfg = opts?.credentialsOverride || getR2RuntimeConfig();
  if (!isR2Configured(cfg)) return { deletedCount: 0, deletedKeys: [] };

  const bucketName = opts?.bucketName || cfg.bucketName || 'livecall-media-storage';
  const maxReturnedKeys = opts?.maxReturnedKeys || 2000;

  const client = getR2Client(cfg);
  const deletedKeys: string[] = [];
  let deletedCount = 0;

  let continuationToken: string | undefined = undefined;
  do {
    const listResp: any = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );

    const keys: string[] = (listResp?.Contents || []).map((c: any) => c.Key).filter(Boolean);
    continuationToken = listResp?.IsTruncated ? listResp?.NextContinuationToken : undefined;

    if (keys.length > 0) {
      const delRes = await deleteObjectsByKeys(keys, {
        bucketName,
        credentialsOverride: cfg,
        batchSize: 1000,
        maxReturnedKeys,
      });
      deletedCount += delRes.deletedCount;

      if (deletedKeys.length < maxReturnedKeys) {
        deletedKeys.push(...delRes.deletedKeys);
        if (deletedKeys.length > maxReturnedKeys) deletedKeys.splice(maxReturnedKeys);
      }
    }
  } while (continuationToken);

  return { deletedCount, deletedKeys };
}

/**
 * Purge media by common key prefixes.
 * - If `purgeAllUploads` is true: deletes `uploads/` prefix.
 * - Otherwise: deletes each prefix in `prefixes`.
 */
export async function purgeR2MediaUploads(
  params: { purgeAllUploads?: boolean; prefixes?: string[]; maxReturnedKeys?: number } = {}
): Promise<{ deletedCount: number; deletedKeys: string[] }> {
  const prefixes = params.purgeAllUploads ? ['uploads/'] : (params.prefixes || []);
  if (prefixes.length === 0) return { deletedCount: 0, deletedKeys: [] };

  let deletedCount = 0;
  const deletedKeys: string[] = [];

  for (const prefix of prefixes) {
    const res = await deleteObjectsByPrefix(prefix, { maxReturnedKeys: params.maxReturnedKeys || 2000 });
    deletedCount += res.deletedCount;
    deletedKeys.push(...res.deletedKeys);
  }

  // Deduplicate keys if multiple prefixes overlap.
  return { deletedCount, deletedKeys: Array.from(new Set(deletedKeys)) };
}
