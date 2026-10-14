/**
 * Native admin handlers for Next.js Route Handlers (from server/routes/officeRbac.routes.ts).
 */
import type { ServerRuntime } from '../../server/runtimeTypes';
import type { AuthOk } from '../nextAuth';
import { ok, err, type HandlerResult } from './handlerResult';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../../server/supabaseAdmin';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';
import { allOfficePermissionKeys } from '../../shared/officeRbac/features';
import {
  OFFICE_FEATURES,
  actorCanManageRbac,
  ensureOfficeRolesSeeded,
  mapRoleRow,
  resolveActorAccess,
  sanitizePermissionKeys,
  slugKey,
} from '../../server/officeRbac';

function schemaMissingResult(detail?: string): HandlerResult {
  return err(503, {
    success: false,
    error: {
      message:
        detail ||
        'Office RBAC tables are missing. In Supabase SQL Editor, run the OFFICE RBAC block at the end of supabase_schema.sql, then refresh.',
      code: 'OFFICE_RBAC_SCHEMA_MISSING',
    },
  });
}

async function loadAccess(profileId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return { admin: null as any, access: null as any };
  const access = await resolveActorAccess(admin, profileId);
  return { admin, access };
}



function matchSegments(segments: string[], pattern: string[]): Record<string, string> | null {
  if (segments.length !== pattern.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.startsWith(':')) params[p.slice(1)] = segments[i];
    else if (p !== segments[i]) return null;
  }
  return params;
}

async function officeRbac_GET_features(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    return ok({ success: true, data: { features: OFFICE_FEATURES } });
}

async function officeRbac_GET_me(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      if (!isSupabaseAdminConfigured()) {
        return err(503, {
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      const { access } = await loadAccess(auth.profileId);
      if (!access) {
        return err(503, {
          success: false,
          error: { message: 'Supabase admin client unavailable', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      return ok({
        success: true,
        data: {
          isSuper: access.isSuper,
          permissions: access.permissions,
          officeRoleId: access.officeRoleId,
          role: access.role,
          features: OFFICE_FEATURES,
          schemaMissing: access.schemaMissing === true,
        },
      });
    } catch (e: any) {
      console.error('[office-rbac/me]', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Failed to load permissions', code: 'OFFICE_RBAC_ERROR' },
      });
    }
  
}

async function officeRbac_GET_roles(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      if (!isSupabaseAdminConfigured()) {
        return err(503, {
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      const { admin, access } = await loadAccess(auth.profileId);
      if (!admin || !access) {
        return err(503, {
          success: false,
          error: { message: 'Supabase admin client unavailable', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) {
        return schemaMissingResult(access.schemaError);
      }
      if (!actorCanManageRbac(access)) {
        return err(403, {
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const seeded = await ensureOfficeRolesSeeded(admin);
      if (seeded.schemaMissing) {
        return schemaMissingResult(seeded.error);
      }
      if (!seeded.ok) {
        return err(500, {
          success: false,
          error: { message: seeded.error || 'Failed to seed roles', code: 'ROLES_SEED_FAILED' },
        });
      }

      const { data: roles, error } = await admin
        .from('office_roles')
        .select('*')
        .order('label', { ascending: true });
      if (error) {
        if (/does not exist|schema cache|42P01/i.test(error.message)) {
          return schemaMissingResult(error.message);
        }
        return err(500, {
          success: false,
          error: { message: error.message, code: 'ROLES_LOAD_FAILED' },
        });
      }

      const ids = (roles || []).map((r: any) => r.id);
      const { data: perms } = ids.length
        ? await admin.from('office_role_permissions').select('role_id, permission_key').in('role_id', ids)
        : { data: [] as any[] };
      const byRole = new Map<string, string[]>();
      for (const p of perms || []) {
        const list = byRole.get(String(p.role_id)) || [];
        list.push(String(p.permission_key));
        byRole.set(String(p.role_id), list);
      }

      return ok({
        success: true,
        data: {
          roles: (roles || []).map((r: any) =>
            mapRoleRow(r, r.is_super ? allOfficePermissionKeys() : byRole.get(String(r.id)) || [])
          ),
          features: OFFICE_FEATURES,
        },
      });
    } catch (e: any) {
      console.error('[office-rbac/roles GET]', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Failed to load roles', code: 'ROLES_LOAD_FAILED' },
      });
    }
  
}

async function officeRbac_POST_roles(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const { admin, access } = await loadAccess(auth.profileId);
      if (!admin || !access) {
        return err(503, {
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResult(access.schemaError);
      if (!actorCanManageRbac(access)) {
        return err(403, {
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const label = String(body.label || '').trim();
      let key = String(body.key || '')
        .trim()
        .toLowerCase() || slugKey(label);
      const description = String(body.description || '').trim();
      if (!label || !key) {
        return err(400, {
          success: false,
          error: { message: 'Label (and key) required.', code: 'INVALID' },
        });
      }
      if (!/^[a-z][a-z0-9_]{1,47}$/.test(key)) {
        return err(400, {
          success: false,
          error: {
            message: 'Key must be snake_case starting with a letter.',
            code: 'INVALID_KEY',
          },
        });
      }

      const permissions = sanitizePermissionKeys(body.permissions);
      const { data: created, error } = await admin
        .from('office_roles')
        .insert({
          key,
          label,
          description,
          is_super: false,
          is_system: false,
        })
        .select('*')
        .single();
      if (error || !created) {
        return err(500, {
          success: false,
          error: { message: error?.message || 'Create failed', code: 'ROLE_CREATE_FAILED' },
        });
      }
      if (permissions.length) {
        await admin.from('office_role_permissions').insert(
          permissions.map((permission_key) => ({
            role_id: created.id,
            permission_key,
          }))
        );
      }
      return ok({
        success: true,
        data: { role: mapRoleRow(created, permissions) },
      });
    } catch (e: any) {
      console.error('[office-rbac/roles POST]', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Create failed', code: 'ROLE_CREATE_FAILED' },
      });
    }
  
}

async function officeRbac_PUT_roles_roleId(auth: AuthOk, params: { roleId: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const { admin, access } = await loadAccess(auth.profileId);
      if (!admin || !access) {
        return err(503, {
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResult(access.schemaError);
      if (!actorCanManageRbac(access)) {
        return err(403, {
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const roleId = String(params.roleId || '').trim();
      const { data: existing, error: findErr } = await admin
        .from('office_roles')
        .select('*')
        .eq('id', roleId)
        .maybeSingle();
      if (findErr || !existing) {
        return err(404, {
          success: false,
          error: { message: 'Role not found.', code: 'NOT_FOUND' },
        });
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.label === 'string' && body.label.trim() && !existing.is_super) {
        patch.label = body.label.trim();
      }
      if (typeof body.description === 'string') {
        patch.description = body.description.trim();
      }

      const { data: updated, error: updErr } = await admin
        .from('office_roles')
        .update(patch)
        .eq('id', roleId)
        .select('*')
        .single();
      if (updErr || !updated) {
        return err(500, {
          success: false,
          error: { message: updErr?.message || 'Update failed', code: 'ROLE_UPDATE_FAILED' },
        });
      }

      let permissions = allOfficePermissionKeys();
      if (!existing.is_super && Array.isArray(body.permissions)) {
        permissions = sanitizePermissionKeys(body.permissions);
        await admin.from('office_role_permissions').delete().eq('role_id', roleId);
        if (permissions.length) {
          await admin.from('office_role_permissions').insert(
            permissions.map((permission_key) => ({ role_id: roleId, permission_key }))
          );
        }
      } else if (!existing.is_super) {
        const { data: perms } = await admin
          .from('office_role_permissions')
          .select('permission_key')
          .eq('role_id', roleId);
        permissions = (perms || []).map((p: any) => String(p.permission_key));
      }

      return ok({
        success: true,
        data: { role: mapRoleRow(updated, permissions) },
      });
    } catch (e: any) {
      console.error('[office-rbac/roles PUT]', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Update failed', code: 'ROLE_UPDATE_FAILED' },
      });
    }
  
}

async function officeRbac_DELETE_roles_roleId(auth: AuthOk, params: { roleId: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const { admin, access } = await loadAccess(auth.profileId);
      if (!admin || !access) {
        return err(503, {
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (!actorCanManageRbac(access)) {
        return err(403, {
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }
      const roleId = String(params.roleId || '').trim();
      const { data: existing } = await admin
        .from('office_roles')
        .select('id, is_system, is_super')
        .eq('id', roleId)
        .maybeSingle();
      if (!existing) {
        return err(404, {
          success: false,
          error: { message: 'Role not found.', code: 'NOT_FOUND' },
        });
      }
      if (existing.is_system || existing.is_super) {
        return err(400, {
          success: false,
          error: { message: 'System / Super roles cannot be deleted.', code: 'SYSTEM_ROLE' },
        });
      }
      const { error } = await admin.from('office_roles').delete().eq('id', roleId);
      if (error) {
        return err(500, {
          success: false,
          error: { message: error.message, code: 'ROLE_DELETE_FAILED' },
        });
      }
      return ok({ success: true, data: { deleted: true } });
    } catch (e: any) {
      console.error('[office-rbac/roles DELETE]', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Delete failed', code: 'ROLE_DELETE_FAILED' },
      });
    }
  
}

async function officeRbac_GET_users(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const { admin, access } = await loadAccess(auth.profileId);
      if (!admin || !access) {
        return err(503, {
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResult(access.schemaError);
      if (!actorCanManageRbac(access)) {
        return err(403, {
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const { data: users, error } = await admin
        .from('profiles')
        .select('id, name, email, role, office_role_id, created_at, updated_at, is_banned')
        .eq('role', 'admin')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        if (/office_role_id|schema cache|does not exist/i.test(error.message)) {
          // Column missing — list admins without office role field
          const { data: fallback, error: fbErr } = await admin
            .from('profiles')
            .select('id, name, email, role, created_at, updated_at, is_banned')
            .eq('role', 'admin')
            .order('created_at', { ascending: false })
            .limit(200);
          if (fbErr) {
            return schemaMissingResult(error.message);
          }
          return ok({
            success: true,
            data: {
              users: (fallback || []).map((u: any) => ({
                id: String(u.id),
                name: u.name || null,
                email: u.email || null,
                role: 'admin',
                officeRoleId: null,
                officeRoleKey: null,
                officeRoleLabel: 'Legacy Super Admin',
                isSuper: true,
                isBanned: u.is_banned === true,
                createdAt: u.created_at || null,
                updatedAt: u.updated_at || null,
              })),
              schemaMissing: true,
            },
          });
        }
        return err(500, {
          success: false,
          error: { message: error.message, code: 'USERS_LOAD_FAILED' },
        });
      }

      const { data: roles } = await admin.from('office_roles').select('id, key, label, is_super');
      const roleById = new Map<
        string,
        { id: string; key: string; label: string; is_super: boolean }
      >();
      for (const r of roles || []) {
        roleById.set(String((r as any).id), {
          id: String((r as any).id),
          key: String((r as any).key),
          label: String((r as any).label),
          is_super: (r as any).is_super === true,
        });
      }

      return ok({
        success: true,
        data: {
          users: (users || []).map((u: any) => {
            const or = u.office_role_id ? roleById.get(String(u.office_role_id)) : null;
            return {
              id: String(u.id),
              name: u.name || null,
              email: u.email || null,
              role: 'admin',
              officeRoleId: u.office_role_id ? String(u.office_role_id) : null,
              officeRoleKey: or?.key || null,
              officeRoleLabel: or
                ? or.label
                : u.office_role_id
                  ? 'Unknown role'
                  : 'Legacy Super Admin',
              isSuper: !u.office_role_id || or?.is_super === true,
              isBanned: u.is_banned === true,
              createdAt: u.created_at || null,
              updatedAt: u.updated_at || null,
            };
          }),
        },
      });
    } catch (e: any) {
      console.error('[office-rbac/users GET]', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Failed to load users', code: 'USERS_LOAD_FAILED' },
      });
    }
  
}

async function officeRbac_POST_users(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const { admin, access } = await loadAccess(auth.profileId);
      if (!admin || !access) {
        return err(503, {
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResult(access.schemaError);
      if (!actorCanManageRbac(access)) {
        return err(403, {
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const name = String(body.name || '').trim();
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const officeRoleId = String(body.officeRoleId || body.office_role_id || '').trim();

      if (!name || !email || !email.includes('@')) {
        return err(400, {
          success: false,
          error: { message: 'Name and valid email required.', code: 'INVALID' },
        });
      }
      const pwError = getPasswordPolicyError(password);
      if (pwError) {
        return err(400, {
          success: false,
          error: { message: pwError, code: 'PASSWORD_POLICY' },
        });
      }
      if (!officeRoleId) {
        return err(400, {
          success: false,
          error: { message: 'Office role is required.', code: 'ROLE_REQUIRED' },
        });
      }

      const { data: officeRole } = await admin
        .from('office_roles')
        .select('id, key, label, is_super')
        .eq('id', officeRoleId)
        .maybeSingle();
      if (!officeRole) {
        return err(400, {
          success: false,
          error: { message: 'Office role not found.', code: 'ROLE_NOT_FOUND' },
        });
      }

      const { data: existingProfile } = await admin
        .from('profiles')
        .select('id, email')
        .ilike('email', email)
        .maybeSingle();
      if (existingProfile?.id) {
        return err(409, {
          success: false,
          error: {
            message: `A profile already exists for ${email}.`,
            code: 'EMAIL_EXISTS',
          },
        });
      }

      const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'admin',
          gender: 'other',
          name,
          full_name: name,
        },
      });
      if (createErr || !createdAuth?.user?.id) {
        const msg = createErr?.message || 'Failed to create Auth user';
        const code = /already/i.test(msg) ? 'EMAIL_EXISTS' : 'AUTH_CREATE_FAILED';
        return err(code === 'EMAIL_EXISTS' ? 409 : 500, {
          success: false,
          error: { message: msg, code },
        });
      }

      const authUserId = createdAuth.user.id;
      const now = new Date().toISOString();
      const profileRow = {
        id: authUserId,
        auth_id: authUserId,
        name,
        email,
        gender: 'other',
        gender_locked: true,
        role: 'admin',
        office_role_id: officeRole.id,
        age: 30,
        nationality: 'United States',
        country_code: 'US',
        bio: `Office staff — ${officeRole.label}`,
        interests: [],
        tags: ['Office', officeRole.label],
        spoken_languages: ['English'],
        avatar_url:
          'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400',
        gallery: [],
        is_verified: true,
        is_onboarded: true,
        agreed_to_terms: true,
        online_status: 'offline',
        coin_balance: 0,
        hourly_coin_rate: 0,
        earnings_coins: 0,
        has_password_set: true,
        created_at: now,
        updated_at: now,
      };

      const { error: upsertErr } = await admin.from('profiles').upsert(profileRow, {
        onConflict: 'id',
      });
      if (upsertErr) {
        try {
          await admin.auth.admin.deleteUser(authUserId);
        } catch {
          /* ignore */
        }
        if (/office_role_id|schema cache|does not exist/i.test(upsertErr.message)) {
          return schemaMissingResult(upsertErr.message);
        }
        return err(500, {
          success: false,
          error: {
            message: upsertErr.message || 'Failed to create office user profile',
            code: 'PROFILE_UPSERT_FAILED',
          },
        });
      }

      await admin
        .from('profiles')
        .update({
          role: 'admin',
          office_role_id: officeRole.id,
          auth_id: authUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUserId);

      return ok({
        success: true,
        data: {
          user: {
            id: authUserId,
            name,
            email,
            role: 'admin',
            officeRoleId: String(officeRole.id),
            officeRoleKey: officeRole.key,
            officeRoleLabel: officeRole.label,
            isSuper: officeRole.is_super === true,
          },
        },
        message: `Office user ${name} created. They can sign in with ${email}.`,
      });
    } catch (e: any) {
      console.error('[office-rbac/users POST]', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Create user failed', code: 'USER_CREATE_FAILED' },
      });
    }
  
}

async function officeRbac_PATCH_users_userId(auth: AuthOk, params: { userId: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const { admin, access } = await loadAccess(auth.profileId);
      if (!admin || !access) {
        return err(503, {
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResult(access.schemaError);
      if (!actorCanManageRbac(access)) {
        return err(403, {
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const userId = String(params.userId || '').trim();
      const officeRoleIdRaw = body.officeRoleId ?? body.office_role_id;
      const officeRoleId =
        officeRoleIdRaw === null || officeRoleIdRaw === ''
          ? null
          : String(officeRoleIdRaw || '').trim() || null;

      if (officeRoleId) {
        const { data: role } = await admin
          .from('office_roles')
          .select('id')
          .eq('id', officeRoleId)
          .maybeSingle();
        if (!role) {
          return err(400, {
            success: false,
            error: { message: 'Office role not found.', code: 'ROLE_NOT_FOUND' },
          });
        }
      }

      const { data: target } = await admin
        .from('profiles')
        .select('id, role')
        .eq('id', userId)
        .maybeSingle();
      if (!target || String(target.role) !== 'admin') {
        return err(404, {
          success: false,
          error: { message: 'Office admin user not found.', code: 'NOT_FOUND' },
        });
      }

      const { error } = await admin
        .from('profiles')
        .update({
          office_role_id: officeRoleId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        if (/office_role_id|schema cache|does not exist/i.test(error.message)) {
          return schemaMissingResult(error.message);
        }
        return err(500, {
          success: false,
          error: { message: error.message, code: 'ASSIGN_FAILED' },
        });
      }

      return ok({
        success: true,
        data: { userId, officeRoleId },
      });
    } catch (e: any) {
      console.error('[office-rbac/users PATCH]', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Assign failed', code: 'ASSIGN_FAILED' },
      });
    }
  
}

export async function dispatchOfficeRbac(
  method: string,
  segments: string[],
  body: Record<string, unknown>,
  
  auth: AuthOk
): Promise<HandlerResult | null> {
  if (method === 'GET') {
    const params = matchSegments(segments, ['features']);
    if (params) return officeRbac_GET_features(auth, {  }, body);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['me']);
    if (params) return officeRbac_GET_me(auth, {  }, body);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['roles']);
    if (params) return officeRbac_GET_roles(auth, {  }, body);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['roles']);
    if (params) return officeRbac_POST_roles(auth, {  }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['roles', ':roleId']);
    if (params) return officeRbac_PUT_roles_roleId(auth, { roleId: params.roleId }, body);
  }
  if (method === 'DELETE') {
    const params = matchSegments(segments, ['roles', ':roleId']);
    if (params) return officeRbac_DELETE_roles_roleId(auth, { roleId: params.roleId }, body);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['users']);
    if (params) return officeRbac_GET_users(auth, {  }, body);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['users']);
    if (params) return officeRbac_POST_users(auth, {  }, body);
  }
  if (method === 'PATCH') {
    const params = matchSegments(segments, ['users', ':userId']);
    if (params) return officeRbac_PATCH_users_userId(auth, { userId: params.userId }, body);
  }
  return null;
}
