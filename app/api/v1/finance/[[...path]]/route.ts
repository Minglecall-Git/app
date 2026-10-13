import { NextRequest } from 'next/server';
import { parseJsonBody, getClientIp } from '../../../../../lib/nextRequest';
import { jsonErr } from '../../../../../lib/nextAuth';
import { enforceRateLimit } from '../../../../../lib/nextRateLimit';
import { dispatchFinance } from '../../../../../lib/handlers/financeDispatch';
import { isFinanceSensitivePath } from '../../../../../lib/handlers/financeSensitivePaths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ path?: string[] }> };

async function handle(req: NextRequest, ctx: RouteCtx) {
  try {
    const { path } = await ctx.params;
    const sub = (path || []).join('/');
    const method = req.method.toUpperCase();

    const tier = isFinanceSensitivePath(sub, method) ? 'sensitive' : 'authenticated';
    const limited = await enforceRateLimit(req, tier, getClientIp(req));
    if (limited) return limited;

    const bodyParsed =
      method === 'GET' || method === 'HEAD'
        ? ({ ok: true as const, data: {} as Record<string, unknown> })
        : await parseJsonBody<Record<string, unknown>>(req);
    if (bodyParsed.ok === false) {
      return jsonErr(bodyParsed.status, bodyParsed.error.message, bodyParsed.error.code);
    }

    return dispatchFinance(req, sub, method, bodyParsed.data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Finance request failed';
    console.error('[api/v1/finance]', err);
    return jsonErr(500, message, 'FINANCE_ERROR');
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
