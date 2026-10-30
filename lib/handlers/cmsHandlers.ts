/**
 * Native admin handlers for Next.js Route Handlers (from server/routes/cms.routes.ts).
 */
import type { ServerRuntime } from '../../server/runtimeTypes';
import type { AuthOk } from '../nextAuth';
import { ok, err, type HandlerResult } from './handlerResult';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../../server/supabaseAdmin';
import {
  isNavAudienceRole,
  isNavBarId,
  mapNavRow,
  navItemToRow,
  normalizeNavPayload,
  validateNavSlice,
  type AppNavItem,
} from '../../shared/appNav';
import { DEFAULT_FEEDBACK_CATALOG } from '../../shared/cms/feedbackCatalog';
import {
  DEFAULT_SITE_BRANDING,
  mapSiteBrandingRow,
  normalizeCustomScripts,
  normalizeGa4MeasurementId,
  normalizeGscVerificationContent,
} from '../../shared/cms/siteBranding';

const CMS_ACTION_TYPES = new Set(['tab', 'modal', 'external', 'policy']);
const POLICY_CATEGORIES = new Set(['safety', 'privacy', 'terms', 'coins', 'creators', 'moderation']);

const FEEDBACK_KINDS = new Set(['toast', 'alert', 'modal', 'inline']);
const FEEDBACK_TYPES = new Set(['success', 'error', 'info', 'warning']);

function mapFeedbackRow(row: any) {
  return {
    key: row.key,
    kind: row.kind || 'toast',
    category: row.category || 'general',
    title: row.title || '',
    message: row.message || '',
    defaultType: row.default_type || 'info',
    active: row.active !== false,
    updatedAt: row.updated_at ?? null,
  };
}

function safeError(err: unknown, fallback: string): string {
  const message = typeof err === 'string' ? err : (err as any)?.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 180) return fallback;
  const lower = message.toLowerCase();
  if (lower.includes('service_role') || lower.includes('smtp') || lower.includes('stack')) return fallback;
  return message;
}

function isSafeHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function requireConfigured(): import('./handlerResult').HandlerResult | null {
  if (!isSupabaseAdminConfigured()) {
    return err(503, { success: false, error: 'Database admin client is not configured.' });
  }
  return null;
}

function mapBannerRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || '',
    tagText: row.badge || 'FEATURED',
    tagColor: row.tag_color || 'bg-indigo-600 text-white',
    imageUrl: row.image_url || '',
    ctaText: row.cta_text || 'Explore Now',
    actionType: row.action_type || 'tab',
    actionTarget: row.action_target || 'coins',
    active: row.active ?? true,
    order: row.order_num ?? 0,
    bgGradient: row.bg_gradient || 'from-indigo-950/90 via-purple-950/70 to-slate-900/90',
  };
}

function mapPolicyRow(row: any) {
  return {
    id: row.id || row.slug,
    slug: row.slug,
    title: row.title,
    category: row.category || 'safety',
    icon: row.icon || 'ShieldCheck',
    summary: row.summary || '',
    content: row.content || '',
    lastUpdated: row.effective_date || row.updated_at || new Date().toISOString(),
    order: row.order_num ?? 0,
    isFeaturedOnHome: row.is_featured ?? true,
    externalUrl: row.external_url || undefined,
  };
}

function mapQuickLinkRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || '',
    icon: row.icon || 'Zap',
    badge: row.badge || undefined,
    actionType: row.action_type || 'tab',
    actionTarget: row.action_target || 'discovery',
    colorGradient: row.color_gradient || 'from-indigo-500 to-purple-600',
    order: row.order_num ?? 0,
    active: row.active ?? true,
  };
}

function validateAction(actionType: unknown, actionTarget: unknown): string | null {
  const type = String(actionType || 'tab');
  if (!CMS_ACTION_TYPES.has(type)) {
    return 'actionType must be one of: tab, modal, external, policy';
  }
  const target = String(actionTarget || '').trim();
  if (!target) return 'actionTarget is required';
  if (type === 'external' && !isSafeHttpUrl(target)) {
    return 'External actionTarget must be a valid http(s) URL';
  }
  return null;
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

async function cms_GET_cms(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const client = getSupabaseAdmin()!;
      const [banners, policies, links, nav] = await Promise.all([
        client.from('home_banners').select('*').order('order_num', { ascending: true }),
        client.from('cms_policies').select('*').order('order_num', { ascending: true }),
        client.from('home_quick_links').select('*').order('order_num', { ascending: true }),
        client.from('app_nav_items').select('*').order('order_num', { ascending: true }),
      ]);
      if (banners.error || policies.error || links.error) {
        return err(500, {
          success: false,
          error: safeError(
            banners.error || policies.error || links.error,
            'Failed to load CMS content'
          ),
        });
      }
      return ok({
        success: true,
        data: {
          banners: (banners.data || []).map(mapBannerRow),
          policies: (policies.data || []).map(mapPolicyRow),
          quickLinks: (links.data || []).map(mapQuickLinkRow),
          navItems: nav.error ? [] : (nav.data || []).map(mapNavRow),
        },
      });
    } catch (e: any) {
      console.error('GET /api/admin/cms error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to load CMS content') });
    }
  
}

async function cms_PUT_cms_banners(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const b = body || {};
      if (!b.id || !String(b.title || '').trim()) {
        return err(400, { success: false, error: 'Banner id and title are required' });
      }
      const actionErr = validateAction(b.actionType || b.action_type, b.actionTarget || b.action_target);
      if (actionErr) return err(400, { success: false, error: actionErr });
      const payload = {
        id: String(b.id),
        title: String(b.title).trim(),
        subtitle: String(b.subtitle || ''),
        badge: String(b.tagText || b.badge || 'FEATURED'),
        cta_text: String(b.ctaText || b.cta_text || 'Explore Now'),
        tag_color: String(b.tagColor || b.tag_color || 'bg-indigo-600 text-white'),
        image_url: String(b.imageUrl || b.image_url || ''),
        action_type: String(b.actionType || b.action_type || 'tab'),
        action_target: String(b.actionTarget || b.action_target || 'discovery'),
        bg_gradient:
          String(b.bgGradient || b.bg_gradient || 'from-indigo-950/90 via-purple-950/70 to-slate-900/90'),
        order_num: Number(b.order ?? b.order_num ?? 0),
        active: b.active ?? true,
        updated_at: new Date().toISOString(),
      };

      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('home_banners')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to save banner') });
      }
      return ok({ success: true, data: mapBannerRow(data || payload) });
    } catch (e: any) {
      console.error('PUT /api/admin/cms/banners error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to save banner') });
    }
  
}

async function cms_PATCH_cms_banners_id_active(auth: AuthOk, params: { id: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const id = String(params.id || '');
      if (!id) return err(400, { success: false, error: 'Banner id is required' });
      if (typeof body?.active !== 'boolean') {
        return err(400, { success: false, error: 'active boolean is required' });
      }
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('home_banners')
        .update({ active: body.active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to update banner') });
      }
      if (!data) return err(404, { success: false, error: 'Banner not found' });
      return ok({ success: true, data: mapBannerRow(data) });
    } catch (e: any) {
      console.error('PATCH /api/admin/cms/banners/:id/active error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to update banner') });
    }
  
}

async function cms_DELETE_cms_banners_id(auth: AuthOk, params: { id: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const id = String(params.id || '');
      if (!id) return err(400, { success: false, error: 'Banner id is required' });
      const client = getSupabaseAdmin()!;
      const { error } = await client.from('home_banners').delete().eq('id', id);
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to delete banner') });
      }
      return ok({ success: true });
    } catch (e: any) {
      console.error('DELETE /api/admin/cms/banners/:id error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to delete banner') });
    }
  
}

async function cms_PUT_cms_policies(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const p = body || {};
      if (!p.id || !String(p.title || '').trim() || !String(p.content || '').trim()) {
        return err(400, { success: false, error: 'Policy id, title, and content are required' });
      }
      const category = String(p.category || 'safety');
      if (!POLICY_CATEGORIES.has(category)) {
        return err(400, { success: false, error: 'Invalid policy category' });
      }
      if (p.externalUrl || p.external_url) {
        if (!isSafeHttpUrl(p.externalUrl || p.external_url)) {
          return err(400, { success: false, error: 'externalUrl must be a valid http(s) URL' });
        }
      }

      const slug =
        String(p.slug || p.title || 'policy')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || `policy-${Date.now()}`;

      const payload = {
        id: String(p.id),
        slug,
        title: String(p.title).trim(),
        category,
        icon: String(p.icon || 'ShieldCheck'),
        summary: String(p.summary || ''),
        content: String(p.content),
        order_num: Number(p.order ?? p.order_num ?? 0),
        is_featured: p.isFeaturedOnHome ?? p.is_featured ?? true,
        external_url: p.externalUrl || p.external_url || null,
        effective_date: p.lastUpdated || p.effective_date || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('cms_policies')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to save policy') });
      }
      return ok({ success: true, data: mapPolicyRow(data || payload) });
    } catch (e: any) {
      console.error('PUT /api/admin/cms/policies error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to save policy') });
    }
  
}

async function cms_DELETE_cms_policies_id(auth: AuthOk, params: { id: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const id = String(params.id || '');
      if (!id) return err(400, { success: false, error: 'Policy id is required' });
      const client = getSupabaseAdmin()!;
      const { error } = await client.from('cms_policies').delete().eq('id', id);
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to delete policy') });
      }
      return ok({ success: true });
    } catch (e: any) {
      console.error('DELETE /api/admin/cms/policies/:id error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to delete policy') });
    }
  
}

async function cms_PUT_cms_quick_links(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const link = body || {};
      if (!link.id || !String(link.title || '').trim()) {
        return err(400, { success: false, error: 'Quick link id and title are required' });
      }
      const actionErr = validateAction(link.actionType || link.action_type, link.actionTarget || link.action_target);
      if (actionErr) return err(400, { success: false, error: actionErr });
      const payload = {
        id: String(link.id),
        title: String(link.title).trim(),
        subtitle: String(link.subtitle || ''),
        icon: String(link.icon || 'Zap'),
        badge: link.badge ? String(link.badge) : null,
        action_type: String(link.actionType || link.action_type || 'tab'),
        action_target: String(link.actionTarget || link.action_target || 'discovery'),
        color_gradient: String(link.colorGradient || link.color_gradient || 'from-indigo-500 to-purple-600'),
        order_num: Number(link.order ?? link.order_num ?? 0),
        active: link.active ?? true,
      };

      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('home_quick_links')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to save quick link') });
      }
      return ok({ success: true, data: mapQuickLinkRow(data || payload) });
    } catch (e: any) {
      console.error('PUT /api/admin/cms/quick-links error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to save quick link') });
    }
  
}

async function cms_PATCH_cms_quick_links_id_active(auth: AuthOk, params: { id: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const id = String(params.id || '');
      if (!id) return err(400, { success: false, error: 'Quick link id is required' });
      if (typeof body?.active !== 'boolean') {
        return err(400, { success: false, error: 'active boolean is required' });
      }
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('home_quick_links')
        .update({ active: body.active })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to update quick link') });
      }
      if (!data) return err(404, { success: false, error: 'Quick link not found' });
      return ok({ success: true, data: mapQuickLinkRow(data) });
    } catch (e: any) {
      console.error('PATCH /api/admin/cms/quick-links/:id/active error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to update quick link') });
    }
  
}

async function cms_DELETE_cms_quick_links_id(auth: AuthOk, params: { id: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const id = String(params.id || '');
      if (!id) return err(400, { success: false, error: 'Quick link id is required' });
      const client = getSupabaseAdmin()!;
      const { error } = await client.from('home_quick_links').delete().eq('id', id);
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to delete quick link') });
      }
      return ok({ success: true });
    } catch (e: any) {
      console.error('DELETE /api/admin/cms/quick-links/:id error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to delete quick link') });
    }
  
}

async function cms_PUT_cms_nav_items_batch(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const audienceRole = String(body?.audienceRole || '');
      const bar = String(body?.bar || '');
      const slot = body?.slot ? String(body.slot) : null;
      const rawItems = body?.items;
      if (!isNavAudienceRole(audienceRole) || !isNavBarId(bar) || !Array.isArray(rawItems)) {
        return err(400, { success: false, error: 'audienceRole, bar, and items[] are required' });
      }
      const items: AppNavItem[] = [];
      for (const raw of rawItems) {
        const normalized = normalizeNavPayload({ ...raw, audienceRole, bar, slot: slot || raw?.slot || 'default' });
        if ('error' in normalized) {
          return err(400, { success: false, error: normalized.error });
        }
        if (slot && normalized.slot !== slot) {
          return err(400, { success: false, error: 'Item slot does not match the slice' });
        }
        items.push(normalized);
      }
      const sliceError = validateNavSlice(items);
      if (sliceError) return err(400, { success: false, error: sliceError });
      const client = getSupabaseAdmin()!;
      let existingQuery = client.from('app_nav_items').select('id, parent_id').eq('audience_role', audienceRole).eq('bar', bar);
      if (slot) existingQuery = existingQuery.eq('slot', slot);
      const existing = await existingQuery;
      if (existing.error) {
        return err(500, { success: false, error: safeError(existing.error.message, 'Failed to load nav items') });
      }
      const keep = new Set(items.map((item) => item.id));
      const removable = (existing.data || []).filter((row: any) => !keep.has(row.id));
      const childIds = removable.filter((row: any) => row.parent_id).map((row: any) => row.id);
      const rootIds = removable.filter((row: any) => !row.parent_id).map((row: any) => row.id);
      if (childIds.length) {
        const deletedChildren = await client.from('app_nav_items').delete().in('id', childIds);
        if (deletedChildren.error) {
          return err(500, { success: false, error: safeError(deletedChildren.error.message, 'Failed to update nav items') });
        }
      }
      if (rootIds.length) {
        const deletedRoots = await client.from('app_nav_items').delete().in('id', rootIds);
        if (deletedRoots.error) {
          return err(500, { success: false, error: safeError(deletedRoots.error.message, 'Failed to update nav items') });
        }
      }
      const parents = items.filter((item) => !item.parentId);
      const children = items.filter((item) => item.parentId);
      if (parents.length) {
        const upsertedParents = await client.from('app_nav_items').upsert(parents.map(navItemToRow), { onConflict: 'id' });
        if (upsertedParents.error) {
          return err(500, { success: false, error: safeError(upsertedParents.error.message, 'Failed to save nav items') });
        }
      }
      if (children.length) {
        const upsertedChildren = await client.from('app_nav_items').upsert(children.map(navItemToRow), { onConflict: 'id' });
        if (upsertedChildren.error) {
          return err(500, { success: false, error: safeError(upsertedChildren.error.message, 'Failed to save nav items') });
        }
      }
      let savedQuery = client.from('app_nav_items').select('*').eq('audience_role', audienceRole).eq('bar', bar);
      if (slot) savedQuery = savedQuery.eq('slot', slot);
      const saved = await savedQuery.order('order_num', { ascending: true });
      if (saved.error) {
        return err(500, { success: false, error: safeError(saved.error.message, 'Failed to save nav items') });
      }
      return ok({ success: true, data: (saved.data || []).map(mapNavRow) });
    } catch (e: any) {
      console.error('PUT /api/admin/cms/nav-items/batch error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to save nav items') });
    }
  
}

async function cms_PUT_cms_nav_items_reorder(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const audienceRole = String(body?.audienceRole || '');
      const bar = String(body?.bar || '');
      const orderedIds = body?.orderedIds;
      if (!isNavAudienceRole(audienceRole) || !isNavBarId(bar) || !Array.isArray(orderedIds)) {
        return err(400, { success: false, error: 'audienceRole, bar, and orderedIds are required' });
      }
      const client = getSupabaseAdmin()!;
      for (let index = 0; index < orderedIds.length; index += 1) {
        const id = String(orderedIds[index] || '');
        if (!id) continue;
        const updated = await client
          .from('app_nav_items')
          .update({ order_num: index + 1, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('audience_role', audienceRole)
          .eq('bar', bar);
        if (updated.error) {
          return err(500, { success: false, error: safeError(updated.error.message, 'Failed to reorder nav items') });
        }
      }
      const rows = await client
        .from('app_nav_items')
        .select('*')
        .eq('audience_role', audienceRole)
        .eq('bar', bar)
        .order('order_num', { ascending: true });
      if (rows.error) {
        return err(500, { success: false, error: safeError(rows.error.message, 'Failed to reorder nav items') });
      }
      return ok({ success: true, data: (rows.data || []).map(mapNavRow) });
    } catch (e: any) {
      console.error('PUT /api/admin/cms/nav-items/reorder error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to reorder nav items') });
    }
  
}

async function cms_PUT_cms_nav_items(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const normalized = normalizeNavPayload(body || {});
      if ('error' in normalized) {
        return err(400, { success: false, error: normalized.error });
      }
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('app_nav_items')
        .upsert(navItemToRow(normalized), { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) {
        return err(500, { success: false, error: safeError(error.message, 'Failed to save nav item') });
      }
      return ok({ success: true, data: mapNavRow(data || navItemToRow(normalized)) });
    } catch (e: any) {
      console.error('PUT /api/admin/cms/nav-items error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to save nav item') });
    }
  
}

async function cms_PATCH_cms_nav_items_id_active(auth: AuthOk, params: { id: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const id = String(params.id || '');
      if (!id) return err(400, { success: false, error: 'Nav item id is required' });
      if (typeof body?.active !== 'boolean') {
        return err(400, { success: false, error: 'active boolean is required' });
      }
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('app_nav_items')
        .update({ active: body.active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) return err(500, { success: false, error: safeError(error.message, 'Failed to update nav item') });
      if (!data) return err(404, { success: false, error: 'Nav item not found' });
      return ok({ success: true, data: mapNavRow(data) });
    } catch (e: any) {
      console.error('PATCH /api/admin/cms/nav-items/:id/active error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to update nav item') });
    }
  
}

async function cms_DELETE_cms_nav_items_id(auth: AuthOk, params: { id: string }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const id = String(params.id || '');
      if (!id) return err(400, { success: false, error: 'Nav item id is required' });
      const client = getSupabaseAdmin()!;
      const { error } = await client.from('app_nav_items').delete().eq('id', id);
      if (error) return err(500, { success: false, error: safeError(error.message, 'Failed to delete nav item') });
      return ok({ success: true });
    } catch (e: any) {
      console.error('DELETE /api/admin/cms/nav-items/:id error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to delete nav item') });
    }
  
}

async function cms_POST_cms_seed_defaults(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const { banners, policies, quickLinks, navItems } = body || {};
      if (
        (banners !== undefined && !Array.isArray(banners)) ||
        (policies !== undefined && !Array.isArray(policies)) ||
        (quickLinks !== undefined && !Array.isArray(quickLinks)) ||
        (navItems !== undefined && !Array.isArray(navItems))
      ) {
        return err(400, {
          success: false,
          error: 'banners, policies, quickLinks, and navItems must be arrays when provided',
        });
      }
      if (!banners && !policies && !quickLinks && !navItems) {
        return err(400, {
          success: false,
          error: 'Provide at least one of banners, policies, quickLinks, or navItems',
        });
      }

      const client = getSupabaseAdmin()!;
      const out: { banners?: any[]; policies?: any[]; quickLinks?: any[]; navItems?: any[] } = {};

      if (Array.isArray(banners)) {
        const bannerRows = banners.map((b: any) => ({
          id: String(b.id),
          title: String(b.title || '').trim(),
          subtitle: String(b.subtitle || ''),
          badge: String(b.tagText || b.badge || 'FEATURED'),
          cta_text: String(b.ctaText || 'Explore Now'),
          tag_color: String(b.tagColor || 'bg-indigo-600 text-white'),
          image_url: String(b.imageUrl || ''),
          action_type: String(b.actionType || 'tab'),
          action_target: String(b.actionTarget || 'discovery'),
          bg_gradient: String(b.bgGradient || 'from-indigo-950/90 via-purple-950/70 to-slate-900/90'),
          order_num: Number(b.order ?? 0),
          active: b.active ?? true,
          updated_at: new Date().toISOString(),
        }));
        const bRes = await client.from('home_banners').upsert(bannerRows, { onConflict: 'id' }).select('*');
        if (bRes.error) {
          return err(500, {
            success: false,
            error: safeError(bRes.error.message, 'Failed to seed banners'),
          });
        }
        out.banners = (bRes.data || []).map(mapBannerRow);
      }

      if (Array.isArray(policies)) {
        const policyRows = policies.map((p: any) => ({
          id: String(p.id),
          slug: String(p.slug || p.id),
          title: String(p.title || '').trim(),
          category: String(p.category || 'safety'),
          icon: String(p.icon || 'ShieldCheck'),
          summary: String(p.summary || ''),
          content: String(p.content || ''),
          order_num: Number(p.order ?? 0),
          is_featured: p.isFeaturedOnHome ?? true,
          external_url: p.externalUrl || null,
          effective_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        const pRes = await client.from('cms_policies').upsert(policyRows, { onConflict: 'id' }).select('*');
        if (pRes.error) {
          return err(500, {
            success: false,
            error: safeError(pRes.error.message, 'Failed to seed policies'),
          });
        }
        out.policies = (pRes.data || []).map(mapPolicyRow);
      }

      if (Array.isArray(quickLinks)) {
        const linkRows = quickLinks.map((l: any) => ({
          id: String(l.id),
          title: String(l.title || '').trim(),
          subtitle: String(l.subtitle || ''),
          icon: String(l.icon || 'Zap'),
          badge: l.badge ? String(l.badge) : null,
          action_type: String(l.actionType || 'tab'),
          action_target: String(l.actionTarget || 'discovery'),
          color_gradient: String(l.colorGradient || 'from-indigo-500 to-purple-600'),
          order_num: Number(l.order ?? 0),
          active: l.active ?? true,
        }));
        const lRes = await client.from('home_quick_links').upsert(linkRows, { onConflict: 'id' }).select('*');
        if (lRes.error) {
          return err(500, {
            success: false,
            error: safeError(lRes.error.message, 'Failed to seed quick links'),
          });
        }
        out.quickLinks = (lRes.data || []).map(mapQuickLinkRow);
      }

      if (Array.isArray(navItems)) {
        const navRows = [];
        for (const raw of navItems) {
          const normalized = normalizeNavPayload(raw);
          if ('error' in normalized) {
            return err(400, { success: false, error: normalized.error });
          }
          navRows.push(navItemToRow(normalized));
        }
        const nRes = await client.from('app_nav_items').upsert(navRows, { onConflict: 'id' }).select('*');
        if (nRes.error) {
          return err(500, {
            success: false,
            error: safeError(nRes.error.message, 'Failed to seed navigation'),
          });
        }
        out.navItems = (nRes.data || []).map(mapNavRow);
      }

      return ok({ success: true, data: out });
    } catch (e: any) {
      console.error('POST /api/admin/cms/seed-defaults error:', e);
      return err(500, { success: false, error: safeError(err, 'Failed to seed CMS defaults') });
    }
  
}

async function cms_GET_cms_feedback(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('ui_feedback_messages')
        .select('*')
        .order('key', { ascending: true });
      if (error) {
        return err(500, {
          success: false,
          error: safeError(error.message, 'Failed to load feedback messages'),
        });
      }
      return ok({
        success: true,
        data: {
          rows: (data || []).map(mapFeedbackRow),
          defaultsCount: DEFAULT_FEEDBACK_CATALOG.length,
        },
      });
    } catch (e: any) {
      console.error('GET /api/admin/cms/feedback error:', e);
      return err(500, {
        success: false,
        error: safeError(err, 'Failed to load feedback messages'),
      });
    }
  
}

async function cms_PUT_cms_feedback(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const key = String(body.key || '').trim();
      if (!key || key.length > 120) {
        return err(400, { success: false, error: 'Valid key is required' });
      }
      const kind = String(body.kind || 'toast');
      const defaultType = String(body.defaultType || body.default_type || 'info');
      if (!FEEDBACK_KINDS.has(kind)) {
        return err(400, { success: false, error: 'Invalid kind' });
      }
      if (!FEEDBACK_TYPES.has(defaultType)) {
        return err(400, { success: false, error: 'Invalid defaultType' });
      }
      const title = String(body.title || '').trim();
      const message = String(body.message ?? '');
      if (!title) {
        return err(400, { success: false, error: 'Title is required' });
      }
      const row = {
        key,
        kind,
        category: String(body.category || 'general').trim() || 'general',
        title,
        message,
        default_type: defaultType,
        active: body.active !== false,
        updated_at: new Date().toISOString(),
      };
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('ui_feedback_messages')
        .upsert(row, { onConflict: 'key' })
        .select('*')
        .maybeSingle();
      if (error) {
        return err(500, {
          success: false,
          error: safeError(error.message, 'Failed to save feedback message'),
        });
      }
      return ok({ success: true, data: mapFeedbackRow(data) });
    } catch (e: any) {
      console.error('PUT /api/admin/cms/feedback error:', e);
      return err(500, {
        success: false,
        error: safeError(err, 'Failed to save feedback message'),
      });
    }
  
}

async function cms_POST_cms_feedback_seed(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const client = getSupabaseAdmin()!;
      const { data: existing, error: exErr } = await client
        .from('ui_feedback_messages')
        .select('key');
      if (exErr) {
        return err(500, {
          success: false,
          error: safeError(exErr.message, 'Failed to read existing feedback keys'),
        });
      }
      const have = new Set((existing || []).map((r: any) => String(r.key)));
      const missing = DEFAULT_FEEDBACK_CATALOG.filter((e) => !have.has(e.key)).map((e) => ({
        key: e.key,
        kind: e.kind,
        category: e.category,
        title: e.title,
        message: e.message,
        default_type: e.defaultType,
        active: true,
        updated_at: new Date().toISOString(),
      }));
      if (!missing.length) {
        return ok({
          success: true,
          data: { inserted: 0, total: have.size, message: 'All catalog keys already present' },
        });
      }
      const { error } = await client.from('ui_feedback_messages').insert(missing);
      if (error) {
        return err(500, {
          success: false,
          error: safeError(error.message, 'Failed to seed feedback messages'),
        });
      }
      return ok({
        success: true,
        data: { inserted: missing.length, total: have.size + missing.length },
      });
    } catch (e: any) {
      console.error('POST /api/admin/cms/feedback/seed error:', e);
      return err(500, {
        success: false,
        error: safeError(err, 'Failed to seed feedback messages'),
      });
    }
  
}

async function cms_GET_cms_seo_branding(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('cms_site_branding')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();
      if (error) {
        return err(500, {
          success: false,
          error: safeError(error.message, 'Failed to load SEO branding'),
        });
      }
      return ok({
        success: true,
        data: mapSiteBrandingRow(data) || { ...DEFAULT_SITE_BRANDING },
      });
    } catch (e: any) {
      console.error('GET /api/admin/cms/seo-branding error:', e);
      return err(500, {
        success: false,
        error: safeError(err, 'Failed to load SEO branding'),
      });
    }
  
}

async function cms_PUT_cms_seo_branding(auth: AuthOk, params: {  }, body: Record<string, unknown>): Promise<HandlerResult> {
    try {
      const cfgErr = requireConfigured(); if (cfgErr) return cfgErr;
      const pageTitle = String(body.pageTitle || body.page_title || '').trim();
      const metaDescription = String(body.metaDescription || body.meta_description || '').trim();
      const siteName = String(body.siteName || body.site_name || '').trim();
      if (!pageTitle) {
        return err(400, { success: false, error: 'Page title is required' });
      }
      if (!metaDescription) {
        return err(400, { success: false, error: 'Meta description is required' });
      }
      if (!siteName) {
        return err(400, { success: false, error: 'Site name is required' });
      }
      const logoUrl = String(body.logoUrl ?? body.logo_url ?? '').trim();
      const faviconUrl = String(body.faviconUrl ?? body.favicon_url ?? '').trim();
      const ogImageUrl = String(body.ogImageUrl ?? body.og_image_url ?? '').trim();
      const themeColor = String(body.themeColor ?? body.theme_color ?? '#09090C').trim() || '#09090C';
      const ga4MeasurementId = normalizeGa4MeasurementId(
        body.ga4MeasurementId ?? body.ga4_measurement_id
      );
      if (ga4MeasurementId === null) {
        return err(400, {
          success: false,
          error: 'Invalid GA4 Measurement ID (expected format G-XXXXXXXXXX)',
        });
      }
      const gscVerificationContent = normalizeGscVerificationContent(
        body.gscVerificationContent ?? body.gsc_verification_content
      );
      if (gscVerificationContent === null) {
        return err(400, {
          success: false,
          error: 'Invalid Google Search Console verification content',
        });
      }
      const headerScripts = normalizeCustomScripts(
        body.headerScripts ?? body.header_scripts
      );
      if (headerScripts === null) {
        return err(400, {
          success: false,
          error: 'Header scripts snippet is too large (max 50KB)',
        });
      }
      const footerScripts = normalizeCustomScripts(
        body.footerScripts ?? body.footer_scripts
      );
      if (footerScripts === null) {
        return err(400, {
          success: false,
          error: 'Footer scripts snippet is too large (max 50KB)',
        });
      }
      for (const [label, url] of [
        ['logoUrl', logoUrl],
        ['faviconUrl', faviconUrl],
        ['ogImageUrl', ogImageUrl],
      ] as const) {
        if (url && !url.startsWith('/') && !isSafeHttpUrl(url)) {
          return err(400, { success: false, error: `Invalid ${label} URL` });
        }
      }
      const row = {
        id: 'default',
        page_title: pageTitle.slice(0, 200),
        meta_description: metaDescription.slice(0, 500),
        site_name: siteName.slice(0, 80),
        logo_url: logoUrl || null,
        favicon_url: faviconUrl || null,
        og_image_url: ogImageUrl || null,
        theme_color: themeColor.slice(0, 32),
        ga4_measurement_id: ga4MeasurementId || null,
        gsc_verification_content: gscVerificationContent || null,
        header_scripts: headerScripts || null,
        footer_scripts: footerScripts || null,
        updated_at: new Date().toISOString(),
      };
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('cms_site_branding')
        .upsert(row, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) {
        return err(500, {
          success: false,
          error: safeError(error.message, 'Failed to save SEO branding'),
        });
      }
      return ok({ success: true, data: mapSiteBrandingRow(data) });
    } catch (e: any) {
      console.error('PUT /api/admin/cms/seo-branding error:', e);
      return err(500, {
        success: false,
        error: safeError(err, 'Failed to save SEO branding'),
      });
    }
  
}

export async function dispatchCmsAdmin(
  method: string,
  segments: string[],
  body: Record<string, unknown>,
  
  auth: AuthOk
): Promise<HandlerResult | null> {
  if (method === 'GET') {
    const params = matchSegments(segments, ['cms']);
    if (params) return cms_GET_cms(auth, {  }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['cms', 'banners']);
    if (params) return cms_PUT_cms_banners(auth, {  }, body);
  }
  if (method === 'PATCH') {
    const params = matchSegments(segments, ['cms', 'banners', ':id', 'active']);
    if (params) return cms_PATCH_cms_banners_id_active(auth, { id: params.id }, body);
  }
  if (method === 'DELETE') {
    const params = matchSegments(segments, ['cms', 'banners', ':id']);
    if (params) return cms_DELETE_cms_banners_id(auth, { id: params.id }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['cms', 'policies']);
    if (params) return cms_PUT_cms_policies(auth, {  }, body);
  }
  if (method === 'DELETE') {
    const params = matchSegments(segments, ['cms', 'policies', ':id']);
    if (params) return cms_DELETE_cms_policies_id(auth, { id: params.id }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['cms', 'quick-links']);
    if (params) return cms_PUT_cms_quick_links(auth, {  }, body);
  }
  if (method === 'PATCH') {
    const params = matchSegments(segments, ['cms', 'quick-links', ':id', 'active']);
    if (params) return cms_PATCH_cms_quick_links_id_active(auth, { id: params.id }, body);
  }
  if (method === 'DELETE') {
    const params = matchSegments(segments, ['cms', 'quick-links', ':id']);
    if (params) return cms_DELETE_cms_quick_links_id(auth, { id: params.id }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['cms', 'nav-items', 'batch']);
    if (params) return cms_PUT_cms_nav_items_batch(auth, {  }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['cms', 'nav-items', 'reorder']);
    if (params) return cms_PUT_cms_nav_items_reorder(auth, {  }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['cms', 'nav-items']);
    if (params) return cms_PUT_cms_nav_items(auth, {  }, body);
  }
  if (method === 'PATCH') {
    const params = matchSegments(segments, ['cms', 'nav-items', ':id', 'active']);
    if (params) return cms_PATCH_cms_nav_items_id_active(auth, { id: params.id }, body);
  }
  if (method === 'DELETE') {
    const params = matchSegments(segments, ['cms', 'nav-items', ':id']);
    if (params) return cms_DELETE_cms_nav_items_id(auth, { id: params.id }, body);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['cms', 'seed-defaults']);
    if (params) return cms_POST_cms_seed_defaults(auth, {  }, body);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['cms', 'feedback']);
    if (params) return cms_GET_cms_feedback(auth, {  }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['cms', 'feedback']);
    if (params) return cms_PUT_cms_feedback(auth, {  }, body);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['cms', 'feedback', 'seed']);
    if (params) return cms_POST_cms_feedback_seed(auth, {  }, body);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['cms', 'seo-branding']);
    if (params) return cms_GET_cms_seo_branding(auth, {  }, body);
  }
  if (method === 'PUT') {
    const params = matchSegments(segments, ['cms', 'seo-branding']);
    if (params) return cms_PUT_cms_seo_branding(auth, {  }, body);
  }
  return null;
}
