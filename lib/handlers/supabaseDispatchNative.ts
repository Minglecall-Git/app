import type { NextRequest } from 'next/server';
import type { AuthOk } from '../nextAuth';
import { getServerRuntime } from '../serverRuntime';
import { parseJsonBody } from '../nextRequest';
import { err, type HandlerResult } from './handlerResult';
import {
  handleSupabaseBulkUpsert,
  handleSupabaseProfiles,
  handleSupabaseStatus,
  handleSupabaseTestQuery,
  handleSupabaseUpdateProfile,
  handleSupabaseUpdateStatus,
  handleSupabaseUpsertProfile,
  handleSupabaseUserStatuses,
} from './supabaseBridgeNative';

export async function dispatchSupabaseNative(
  req: NextRequest,
  segments: string[],
  auth: AuthOk | null
): Promise<HandlerResult> {
  const path = segments.join('/');
  const runtime = await getServerRuntime();

  if (path === 'status' && req.method === 'GET') {
    return handleSupabaseStatus();
  }

  if (!auth) {
    return err(401, {
      success: false,
      error: { message: 'Missing bearer token', code: 'UNAUTHORIZED' },
    });
  }

  if (path === 'update-profile' && req.method === 'POST') {
    const parsed = await parseJsonBody<Record<string, unknown>>(req, { large: true });
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleSupabaseUpdateProfile(runtime, auth, parsed.data || {});
  }

  if (path === 'upsert-profile' && req.method === 'POST') {
    const parsed = await parseJsonBody<Record<string, unknown>>(req, { large: true });
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleSupabaseUpsertProfile(runtime, auth, parsed.data || {});
  }

  if (path === 'bulk-upsert-profiles' && req.method === 'POST') {
    if (auth.role !== 'admin') {
      return err(403, {
        success: false,
        error: { message: 'Admin privileges required', code: 'FORBIDDEN' },
      });
    }
    const parsed = await parseJsonBody<Record<string, unknown>>(req, { large: true });
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleSupabaseBulkUpsert(runtime, parsed.data || {});
  }

  if (path === 'update-status' && req.method === 'POST') {
    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleSupabaseUpdateStatus(runtime, auth, parsed.data || {});
  }

  if (path === 'user-statuses' && req.method === 'GET') {
    return handleSupabaseUserStatuses(runtime);
  }

  if (path === 'profiles' && req.method === 'GET') {
    return handleSupabaseProfiles();
  }

  if (path === 'test-query' && req.method === 'POST') {
    if (auth.role !== 'admin') {
      return err(403, {
        success: false,
        error: { message: 'Admin privileges required', code: 'FORBIDDEN' },
      });
    }
    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleSupabaseTestQuery(runtime, parsed.data || {});
  }

  return err(404, {
    success: false,
    error: { message: 'Supabase bridge route not found', code: 'NOT_FOUND' },
  });
}
