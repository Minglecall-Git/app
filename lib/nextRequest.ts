import type { NextRequest } from 'next/server';

const DEFAULT_MAX_BYTES = 1_000_000; // 1MB default
const LARGE_MAX_BYTES = 25 * 1024 * 1024; // Express parity for large uploads/bodies

export type ParseJsonResult<T = unknown> = {
  ok: boolean;
  data: T;
  status: number;
  error: { message: string; code: string };
};

/**
 * Parse JSON body from a NextRequest with an optional size cap.
 * Use `large: true` only for endpoints that previously allowed Express 25mb bodies.
 */
export async function parseJsonBody<T = unknown>(
  req: NextRequest,
  opts?: { large?: boolean; maxBytes?: number }
): Promise<ParseJsonResult<T>> {
  const maxBytes = opts?.maxBytes ?? (opts?.large ? LARGE_MAX_BYTES : DEFAULT_MAX_BYTES);
  const contentLength = Number(req.headers.get('content-length') || 0);
  const emptyErr = { message: '', code: '' };
  if (contentLength > maxBytes) {
    return {
      ok: false,
      data: {} as T,
      status: 413,
      error: { message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' },
    };
  }

  try {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      return {
        ok: false,
        data: {} as T,
        status: 413,
        error: { message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' },
      };
    }
    if (buf.byteLength === 0) {
      return { ok: true, data: {} as T, status: 0, error: emptyErr };
    }
    const text = new TextDecoder().decode(buf);
    if (!text.trim()) {
      return { ok: true, data: {} as T, status: 0, error: emptyErr };
    }
    const data = JSON.parse(text) as T;
    return { ok: true, data, status: 0, error: emptyErr };
  } catch {
    return {
      ok: false,
      data: {} as T,
      status: 400,
      error: { message: 'Invalid JSON body', code: 'INVALID_JSON' },
    };
  }
}

/** Client IP for rate limiting (best-effort behind proxies). */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}
