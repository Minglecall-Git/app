import { getAccessToken } from './apiClient';
import { apiUrl } from './apiBase';

export interface DirectUploadOptions {
  file: File;
  userId?: string;
  category?:
    | 'avatar'
    | 'gallery'
    | 'gallery_video'
    | 'chat_media'
    | 'moment'
    | 'verification'
    | 'intro_video';
  onProgress?: (percent: number) => void;
}

export interface DirectUploadResult {
  publicUrl: string;
  storageKey: string;
  fileSize: number;
  contentType: string;
  durationMs: number;
}

/** Local-only preview URLs must never be persisted as the authoritative avatar/media URL. */
export function isEphemeralMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return trimmed.startsWith('blob:') || trimmed.startsWith('data:');
}

export function isPersistableMediaUrl(url?: string | null): boolean {
  return Boolean(url && !isEphemeralMediaUrl(url));
}

/** Build JSON request headers with the current Supabase access token when available. */
async function getAuthJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('[R2 Storage] Unable to read Supabase session for Authorization header:', err);
  }
  return headers;
}

/** Auth headers without Content-Type (browser sets multipart boundary for FormData). */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('[R2 Storage] Unable to read Supabase session for Authorization header:', err);
  }
  return headers;
}

/** Vercel serverless body limit — server fallback cannot carry larger files. */
const SERVER_FALLBACK_MAX_BYTES = 4 * 1024 * 1024;

const R2_CORS_HINT =
  'Direct upload failed. Ensure your R2 bucket CORS allows PUT from this site (AllowedOrigins: your domain or "*", AllowedMethods: GET, PUT, HEAD, AllowedHeaders: *).';

function extractStorageErrorMessage(payload: any, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error?.message) return String(payload.error.message);
  if (payload.message) return String(payload.message);
  return fallback;
}

function isStorageNotConfiguredResponse(status: number, payload: any): boolean {
  return (
    status === 503 ||
    payload?.configured === false ||
    payload?.code === 'STORAGE_NOT_CONFIGURED'
  );
}

/** Prefer authenticated media proxy when we have a storage key (reliable for <video>). */
export function mediaProxyUrl(storageKey: string): string {
  return `/api/storage/media?key=${encodeURIComponent(storageKey)}`;
}

/**
 * Copy FileList entries into stable File objects before any await.
 * Browsers (esp. mobile) often invalidate later FileList items after the first
 * async upload, which produces blank/broken previews for the 2nd+ files.
 */
export async function snapshotFilesForUpload(files: FileList | File[] | null | undefined): Promise<File[]> {
  const list = Array.from(files || []).filter(Boolean) as File[];
  if (!list.length) return [];
  return Promise.all(
    list.map(async (file) => {
      try {
        const buffer = await file.arrayBuffer();
        return new File([buffer], file.name || 'upload.bin', {
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified || Date.now(),
        });
      } catch {
        // Last resort: shallow copy (still better than a live FileList handle)
        return new File([file], file.name || 'upload.bin', {
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified || Date.now(),
        });
      }
    })
  );
}

/** Pull storage key from a media proxy / CDN / uploads path URL. */
export function extractStorageKeyFromMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const raw = String(url).trim();
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:') || raw.includes('unsplash.com')) {
    return undefined;
  }
  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const u = new URL(raw, base);
    if (u.pathname.includes('/api/storage/media')) {
      const key = u.searchParams.get('key');
      if (key) return String(key).trim();
    }
  } catch {
    /* ignore */
  }
  const m = raw.match(/[?&]key=([^&]+)/);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]).trim();
    } catch {
      return m[1].trim();
    }
  }
  const uploadsIdx = raw.indexOf('/uploads/');
  if (uploadsIdx >= 0) {
    const key = raw.slice(uploadsIdx + 1).split('?')[0].split('#')[0];
    if (key.startsWith('uploads/')) return key;
  }
  if (raw.startsWith('uploads/')) return raw.split('?')[0];
  return undefined;
}

/**
 * Delete owned R2 objects after gallery photo/video remove.
 * Accepts storage keys and/or media URLs. Best-effort: returns false on failure.
 */
export async function deleteMediaFromR2(options: {
  key?: string;
  keys?: string[];
  url?: string;
  urls?: string[];
}): Promise<{ success: boolean; deletedCount: number; skipped?: boolean; error?: string }> {
  const keys = [
    ...(options.keys || []),
    ...(options.key ? [options.key] : []),
  ]
    .map((k) => String(k || '').trim())
    .filter(Boolean);
  const urls = [
    ...(options.urls || []),
    ...(options.url ? [options.url] : []),
  ]
    .map((u) => String(u || '').trim())
    .filter(Boolean);

  for (const u of urls) {
    const extracted = extractStorageKeyFromMediaUrl(u);
    if (extracted) keys.push(extracted);
  }

  const unique = [...new Set(keys)];
  if (!unique.length) {
    // External / preset URLs have nothing to delete in R2
    return { success: true, deletedCount: 0, skipped: true };
  }

  try {
    const res = await fetch(apiUrl('/api/storage/delete'), {
      method: 'POST',
      headers: await getAuthJsonHeaders(),
      body: JSON.stringify({ keys: unique }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      const msg =
        (typeof data?.error === 'string' && data.error) ||
        data?.error?.message ||
        `Delete failed (${res.status})`;
      console.warn('[R2 Storage] deleteMediaFromR2 rejected:', msg);
      return { success: false, deletedCount: 0, error: msg };
    }
    return {
      success: true,
      deletedCount: Number(data?.deletedCount) || unique.length,
    };
  } catch (err: any) {
    console.warn('[R2 Storage] deleteMediaFromR2 failed:', err?.message || err);
    return { success: false, deletedCount: 0, error: err?.message || 'Delete failed' };
  }
}

// Normalize any media URL to ensure raw authenticated S3 endpoints are routed via proxy
export function normalizeMediaUrl(url: string | undefined | null, storageKey?: string): string {
  const key = storageKey ? String(storageKey).trim() : '';
  if ((!url || !String(url).trim()) && key) {
    return mediaProxyUrl(key);
  }
  if (!url) return '';
  const safeUrl = String(url);
  if (safeUrl.startsWith('blob:') || safeUrl.startsWith('data:')) return safeUrl;
  // Prefer same-origin proxy whenever we have a key — reliable for <video> on mobile.
  if (key && key.startsWith('uploads/')) {
    return mediaProxyUrl(key);
  }
  if (safeUrl.includes('.r2.cloudflarestorage.com')) {
    const parts = safeUrl.split('.r2.cloudflarestorage.com/');
    if (parts[1]) {
      const rawPath = parts[1];
      const match = rawPath.match(/uploads\/.+$/);
      const resolvedKey = key || (match ? match[0] : rawPath);
      return mediaProxyUrl(resolvedKey);
    }
  }
  return safeUrl;
}

// Fallback: multipart FormData through the API (no FileReader / base64 — avoids mobile OOM).
async function uploadMediaViaServerFallback(
  file: File,
  userId?: string,
  category: string = 'avatar',
  onProgress?: (p: number) => void
): Promise<DirectUploadResult> {
  const startTime = performance.now();

  if (file.size > SERVER_FALLBACK_MAX_BYTES) {
    throw new Error(
      `${R2_CORS_HINT} This file (${Math.round(file.size / (1024 * 1024))} MB) is too large for the server fallback path.`
    );
  }

  if (onProgress) onProgress(30);

  const form = new FormData();
  form.append('file', file, file.name);
  form.append('filename', file.name);
  form.append('contentType', file.type || 'application/octet-stream');
  form.append('category', category);
  if (userId) form.append('userId', userId);

  if (onProgress) onProgress(55);

  const res = await fetch(apiUrl('/api/storage/upload'), {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (isStorageNotConfiguredResponse(res.status, data)) {
      throw new Error('Storage not configured');
    }
    const msg = extractStorageErrorMessage(data, 'Server storage upload failed');
    if (res.status === 413 || data?.code === 'FILE_TOO_LARGE') {
      throw new Error(`${R2_CORS_HINT} ${msg}`);
    }
    throw new Error(msg);
  }

  if (onProgress) onProgress(100);

  const safePublicUrl = normalizeMediaUrl(data.publicUrl, data.storageKey);

  return {
    publicUrl: safePublicUrl,
    storageKey: data.storageKey,
    fileSize: data.fileSize || file.size,
    contentType: data.contentType || file.type,
    durationMs: Math.round(performance.now() - startTime),
  };
}

async function putFileWithProgress(
  url: string,
  file: File,
  headers: Record<string, string> | undefined,
  onProgress?: (percent: number) => void,
  extraHeaders?: Record<string, string>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    if (headers) {
      Object.entries(headers).forEach(([key, val]) => {
        xhr.setRequestHeader(key, val as string);
      });
    }
    if (extraHeaders) {
      Object.entries(extraHeaders).forEach(([key, val]) => {
        xhr.setRequestHeader(key, val);
      });
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        reject(new Error(`Storage PUT status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Direct upload network/CORS error'));
    };

    xhr.send(file);
  });
}

function inferContentType(file: File, category: string): string {
  if (file.type) return file.type;
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.m4v')) return 'video/x-m4v';
  if (name.endsWith('.mp4') || category === 'gallery_video' || category === 'intro_video') {
    return 'video/mp4';
  }
  return 'image/jpeg';
}

export async function uploadMediaDirectlyToR2(
  options: DirectUploadOptions
): Promise<DirectUploadResult> {
  const { file, userId, category = 'chat_media', onProgress } = options;
  const startTime = performance.now();
  const contentType = inferContentType(file, category);

  try {
    // 1. Request presigned URL from server API (authenticated)
    const presignRes = await fetch(apiUrl('/api/storage/presigned-url'), {
      method: 'POST',
      headers: await getAuthJsonHeaders(),
      body: JSON.stringify({
        filename: file.name,
        contentType,
        fileSize: file.size,
        // Informational only — server always overrides with auth profile id
        userId,
        category,
      }),
    });

    const signData = await presignRes.json().catch(() => ({}));

    if (!presignRes.ok) {
      if (isStorageNotConfiguredResponse(presignRes.status, signData)) {
        throw new Error('Storage not configured');
      }
      const authMessage = extractStorageErrorMessage(
        signData,
        `Presigned URL request failed (${presignRes.status})`
      );
      // Auth / validation failures: do not silently fall through to mock
      if (presignRes.status === 401 || presignRes.status === 403 || presignRes.status === 400) {
        throw new Error(authMessage);
      }
      console.warn('[R2 Storage] Presigned URL request failed, using server upload fallback:', authMessage);
      return await uploadMediaViaServerFallback(file, userId, category, onProgress);
    }

    if (isStorageNotConfiguredResponse(presignRes.status, signData) && !signData?.presignedUrl) {
      throw new Error('Storage not configured');
    }

    const { presignedUrl, publicUrl, storageKey, headers, isMock } = signData;
    if (!presignedUrl) {
      throw new Error('Storage not configured');
    }

    // Mock uploads require Bearer auth on PUT /mock-upload
    const extraHeaders: Record<string, string> = {};
    const needsAuthOnPut =
      Boolean(isMock) ||
      (typeof presignedUrl === 'string' &&
        (presignedUrl.startsWith('/') || presignedUrl.includes('/api/storage/mock-upload')));
    if (needsAuthOnPut) {
      const token = await getAccessToken();
      if (token) {
        extraHeaders.Authorization = `Bearer ${token}`;
      }
    }

    // 2. Direct PUT upload to Cloudflare R2 (or auth-gated local mock) with progress tracking
    try {
      await putFileWithProgress(presignedUrl, file, headers, onProgress, extraHeaders);

      const durationMs = Math.round(performance.now() - startTime);

      return {
        publicUrl: normalizeMediaUrl(publicUrl, storageKey) || (storageKey ? mediaProxyUrl(storageKey) : ''),
        storageKey,
        fileSize: file.size,
        contentType: contentType || file.type || 'application/octet-stream',
        durationMs,
      };
    } catch (putErr) {
      console.warn('Direct PUT failed, seamlessly using server upload fallback:', putErr);
      return await uploadMediaViaServerFallback(file, userId, category, onProgress);
    }
  } catch (err: any) {
    if (String(err?.message || '').includes('Storage not configured')) {
      throw err;
    }
    console.warn('Direct presign flow failed, fallback to server upload:', err.message);
    return await uploadMediaViaServerFallback(file, userId, category, onProgress);
  }
}
