import type { NextRequest } from 'next/server';

export type HandlerResult = {
  status: number;
  body: unknown;
};

export function ok(body: unknown, status = 200): HandlerResult {
  return { status, body };
}

export function err(status: number, body: unknown): HandlerResult {
  return { status, body };
}

export function toResponse(result: HandlerResult): Response {
  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function withRuntimeTag(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body, runtime: 'next-native' };
}

export function getForwardedHost(req: NextRequest): string {
  return String(req.headers.get('x-forwarded-host') || req.headers.get('host') || '');
}

export function getForwardedProto(req: NextRequest): string {
  return String(req.headers.get('x-forwarded-proto') || 'http');
}
