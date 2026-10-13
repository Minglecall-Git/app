/**
 * POST /api/admin/cms/seed-defaults — upsert starter homepage CMS into Supabase.
 */
import {
  sendJson,
  readJsonBody,
  requireAdminFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';
import { mapNavRow, navItemToRow, normalizeNavPayload } from '../../../../shared/appNav';

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
    order: row.order_num || 1,
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
    lastUpdated: row.effective_date || new Date().toISOString().split('T')[0],
    order: row.order_num || 1,
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
    order: row.order_num || 1,
    active: row.active ?? true,
  };
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdminFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: { message: 'Supabase not configured' } });
  }

  try {
    const body = await readJsonBody(req);
    const { banners, policies, quickLinks, navItems } = body || {};
    if (
      (banners !== undefined && !Array.isArray(banners)) ||
      (policies !== undefined && !Array.isArray(policies)) ||
      (quickLinks !== undefined && !Array.isArray(quickLinks)) ||
      (navItems !== undefined && !Array.isArray(navItems))
    ) {
      return sendJson(res, 400, {
        success: false,
        error: 'banners, policies, quickLinks, and navItems must be arrays when provided',
      });
    }
    if (!banners && !policies && !quickLinks && !navItems) {
      return sendJson(res, 400, {
        success: false,
        error: 'Provide at least one of banners, policies, quickLinks, or navItems',
      });
    }

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
        return sendJson(res, 500, { success: false, error: bRes.error.message || 'Failed to seed banners' });
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
        return sendJson(res, 500, { success: false, error: pRes.error.message || 'Failed to seed policies' });
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
        return sendJson(res, 500, { success: false, error: lRes.error.message || 'Failed to seed quick links' });
      }
      out.quickLinks = (lRes.data || []).map(mapQuickLinkRow);
    }

    if (Array.isArray(navItems)) {
      const navRows = [];
      for (const raw of navItems) {
        const normalized = normalizeNavPayload(raw);
        if ('error' in normalized) {
          return sendJson(res, 400, { success: false, error: normalized.error });
        }
        navRows.push(navItemToRow(normalized));
      }
      const nRes = await client.from('app_nav_items').upsert(navRows, { onConflict: 'id' }).select('*');
      if (nRes.error) {
        return sendJson(res, 500, { success: false, error: nRes.error.message || 'Failed to seed navigation' });
      }
      out.navItems = (nRes.data || []).map(mapNavRow);
    }

    return sendJson(res, 200, { success: true, data: out });
  } catch (err: any) {
    console.error('[api/admin/cms/seed-defaults]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Failed to seed CMS defaults' });
  }
}
