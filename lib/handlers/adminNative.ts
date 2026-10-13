import type { NextRequest } from 'next/server';
import { getServerRuntime } from '../serverRuntime';
import { handleAdminApiHealth, handleOverrideEarningRate } from './adminInlineNative';
import type { AuthOk } from '../nextAuth';
import { parseJsonBody } from '../nextRequest';
import { toResponse } from './handlerResult';
import { dispatchAdminCore } from './adminHandlers';
import { dispatchCmsAdmin } from './cmsHandlers';
import { dispatchOfficeRbac } from './officeRbacHandlers';

const RESERVED_NATIVE = new Set(['terminate-call', 'issue-warning', 'livekit']);

function requestHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

/**
 * Native Next dispatcher for /api/admin/* (except dedicated route.ts files for terminate-call, issue-warning, livekit/spectator-token).
 */
export async function dispatchAdminNative(
  req: NextRequest,
  segments: string[],
  auth: AuthOk
): Promise<Response> {
  const pathKey = segments.join('/');

  if (segments[0] === 'livekit') {
    return Response.json(
      { success: false, error: { message: 'Use /api/admin/livekit/spectator-token', code: 'NOT_FOUND' } },
      { status: 404 }
    );
  }
  if (RESERVED_NATIVE.has(segments[0] || '')) {
    return Response.json(
      { success: false, error: { message: 'Route has a dedicated native handler', code: 'NOT_FOUND' } },
      { status: 404 }
    );
  }

  if (pathKey === 'override-earning-rate' && req.method === 'POST') {
    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (parsed.ok === false) {
      return Response.json(
        { success: false, error: { message: parsed.error.message, code: parsed.error.code } },
        { status: parsed.status }
      );
    }
    const ctx = await getServerRuntime();
    const result = await handleOverrideEarningRate(ctx, auth, parsed.data || {});
    return toResponse(result);
  }

  if (pathKey === 'api-health' && req.method === 'GET') {
    const ctx = await getServerRuntime();
    const result = await handleAdminApiHealth(ctx, req);
    return toResponse(result);
  }

  const method = req.method.toUpperCase();
  let body: Record<string, unknown> = {};
  if (method !== 'GET' && method !== 'HEAD') {
    const bodyParsed = await parseJsonBody<Record<string, unknown>>(req);
    if (bodyParsed.ok === false) {
      return Response.json(
        { success: false, error: { message: bodyParsed.error.message, code: bodyParsed.error.code } },
        { status: bodyParsed.status }
      );
    }
    body = bodyParsed.data || {};
  }
  const headers = requestHeaders(req);
  const ctx = await getServerRuntime();

  if (segments[0] === 'office-rbac') {
    const sub = segments.slice(1);
    const result = await dispatchOfficeRbac(method, sub, body, auth);
    if (result) return toResponse(result);
    return Response.json(
      { success: false, error: { message: 'Office RBAC route not found', code: 'NOT_FOUND' } },
      { status: 404 }
    );
  }

  if (segments[0] === 'cms') {
    const result = await dispatchCmsAdmin(method, segments, body, auth);
    if (result) return toResponse(result);
    return Response.json(
      { success: false, error: { message: 'CMS route not found', code: 'NOT_FOUND' } },
      { status: 404 }
    );
  }

  const result = await dispatchAdminCore(method, segments, body, ctx, auth, headers);
  if (result) return toResponse(result);

  return Response.json(
    { success: false, error: { message: 'Admin route not found', code: 'NOT_FOUND' } },
    { status: 404 }
  );
}
