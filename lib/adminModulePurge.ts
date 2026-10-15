/**
 * Granular admin module / component purge catalog + execution.
 * All destructive ops require ALLOW_FACTORY_RESET (enforced by caller) + typed confirm.
 */
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  isSupabaseSecretConfigured,
} from '../server/supabaseAdmin';
import { purgeR2MediaUploads, clearLocalMediaCache } from '../server/r2Storage';

export type ModulePurgeGroup =
  | 'users_social'
  | 'matching_calls'
  | 'finance_accounts'
  | 'creators_agency'
  | 'cms_catalog'
  | 'media_r2';

export type ModulePurgeId =
  | 'messages'
  | 'matches_swipes'
  | 'friend_requests'
  | 'favorites'
  | 'blocked_users'
  | 'call_logs'
  | 'wallet_ledger'
  | 'coin_purchases'
  | 'finance_settlements'
  | 'payout_requests'
  | 'user_payout_cards'
  | 'agency_memberships'
  | 'creator_metrics'
  | 'creator_goals'
  | 'creator_reviews'
  | 'user_daily_rewards'
  | 'feed_posts'
  | 'moderation_reports'
  | 'coin_packages'
  | 'virtual_gifts_catalog'
  | 'home_banners'
  | 'home_quick_links'
  | 'cms_policies'
  | 'r2_user_media'
  | 'r2_all_uploads'
  | 'reset_caller_coins'
  | 'reset_creator_earnings';

export interface ModulePurgeDef {
  id: ModulePurgeId;
  label: string;
  description: string;
  group: ModulePurgeGroup;
  /** Tables counted / deleted (simple delete-all). */
  tables?: Array<{ name: string; notNullColumn: string }>;
  /** Requires typed confirm beyond DELETE. */
  confirmPhrase: string;
  financeRisk?: boolean;
  r2Mode?: 'user_media_prefixes' | 'all_uploads';
  /** Special handlers */
  special?:
    | 'finance_rpc'
    | 'virtual_gifts_reset'
    | 'reset_caller_coins'
    | 'reset_creator_earnings';
}

export const MODULE_PURGE_GROUPS: Array<{ id: ModulePurgeGroup; label: string }> = [
  { id: 'users_social', label: 'Users & Social' },
  { id: 'matching_calls', label: 'Matching & Calls' },
  { id: 'finance_accounts', label: 'Finance & Accounts' },
  { id: 'creators_agency', label: 'Creators & Agency' },
  { id: 'cms_catalog', label: 'CMS & Catalog' },
  { id: 'media_r2', label: 'Media (Cloudflare R2)' },
];

const DEFAULT_R2_USER_PREFIXES = [
  'uploads/avatar/',
  'uploads/gallery/',
  'uploads/gallery_video/',
  'uploads/chat_media/',
  'uploads/moment/',
  'uploads/verification/',
  'uploads/intro_video/',
  'uploads/media/',
];

export const MODULE_PURGE_CATALOG: ModulePurgeDef[] = [
  {
    id: 'messages',
    label: 'Messages & Clears',
    description: 'Chat messages and conversation clear markers.',
    group: 'users_social',
    confirmPhrase: 'DELETE',
    tables: [
      { name: 'messages', notNullColumn: 'id' },
      { name: 'message_conversation_clears', notNullColumn: 'user_id' },
    ],
  },
  {
    id: 'friend_requests',
    label: 'Friend Requests',
    description: 'Pending and accepted friend request rows.',
    group: 'users_social',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'friend_requests', notNullColumn: 'id' }],
  },
  {
    id: 'favorites',
    label: 'Favorites',
    description: 'User favorites list.',
    group: 'users_social',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'favorites', notNullColumn: 'user_id' }],
  },
  {
    id: 'blocked_users',
    label: 'Blocks',
    description: 'Blocked user relationships.',
    group: 'users_social',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'blocked_users', notNullColumn: 'user_id' }],
  },
  {
    id: 'feed_posts',
    label: 'Feed Posts',
    description: 'Moments / feed posts and likes.',
    group: 'users_social',
    confirmPhrase: 'DELETE',
    tables: [
      { name: 'feed_post_likes', notNullColumn: 'post_id' },
      { name: 'feed_posts', notNullColumn: 'id' },
    ],
  },
  {
    id: 'moderation_reports',
    label: 'Moderation Reports',
    description: 'User reports and moderation tickets.',
    group: 'users_social',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'moderation_reports', notNullColumn: 'id' }],
  },
  {
    id: 'matches_swipes',
    label: 'Matches & Swipes',
    description: 'Discovery swipe / match graph (matches table).',
    group: 'matching_calls',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'matches', notNullColumn: 'id' }],
  },
  {
    id: 'call_logs',
    label: 'Call Logs',
    description: 'Persisted video call history rows.',
    group: 'matching_calls',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'call_logs', notNullColumn: 'id' }],
  },
  {
    id: 'wallet_ledger',
    label: 'Wallet Ledger',
    description: 'Operational coin movements (call/gift/reward lines).',
    group: 'finance_accounts',
    confirmPhrase: 'PURGE FINANCE',
    financeRisk: true,
    tables: [{ name: 'wallet_ledger', notNullColumn: 'id' }],
  },
  {
    id: 'coin_purchases',
    label: 'Coin Purchases',
    description: 'Funding intents (admin manual + gateway).',
    group: 'finance_accounts',
    confirmPhrase: 'PURGE FINANCE',
    financeRisk: true,
    tables: [{ name: 'coin_purchases', notNullColumn: 'id' }],
  },
  {
    id: 'finance_settlements',
    label: 'Settlements & Financial Ledger',
    description:
      'Salary batches, line items, settlement events, financial_ledger, and settlement periods (atomic RPC).',
    group: 'finance_accounts',
    confirmPhrase: 'PURGE FINANCE',
    financeRisk: true,
    special: 'finance_rpc',
  },
  {
    id: 'payout_requests',
    label: 'Payout Requests',
    description: 'Creator / TL payout request queue.',
    group: 'finance_accounts',
    confirmPhrase: 'PURGE FINANCE',
    financeRisk: true,
    tables: [{ name: 'payout_requests', notNullColumn: 'id' }],
  },
  {
    id: 'user_payout_cards',
    label: 'User Payout Cards',
    description: 'Saved bank / PayPal / wallet payout methods.',
    group: 'finance_accounts',
    confirmPhrase: 'PURGE FINANCE',
    financeRisk: true,
    tables: [{ name: 'user_payout_cards', notNullColumn: 'id' }],
  },
  {
    id: 'reset_caller_coins',
    label: 'Zero Caller Coin Balances',
    description: 'Sets profiles.coin_balance = 0 for all profiles (does not delete ledger).',
    group: 'finance_accounts',
    confirmPhrase: 'PURGE FINANCE',
    financeRisk: true,
    special: 'reset_caller_coins',
  },
  {
    id: 'reset_creator_earnings',
    label: 'Zero Creator Earnings Counters',
    description: 'Resets earnings_coins and related lifetime counters on profiles.',
    group: 'finance_accounts',
    confirmPhrase: 'PURGE FINANCE',
    financeRisk: true,
    special: 'reset_creator_earnings',
  },
  {
    id: 'agency_memberships',
    label: 'Agency Memberships',
    description: 'Formal host ↔ team leader membership audit rows.',
    group: 'creators_agency',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'agency_memberships', notNullColumn: 'id' }],
  },
  {
    id: 'creator_metrics',
    label: 'Creator Metrics',
    description: 'Live creator performance metrics.',
    group: 'creators_agency',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'creator_metrics', notNullColumn: 'creator_id' }],
  },
  {
    id: 'creator_goals',
    label: 'Creator Goals',
    description: 'Creator target / goal rows.',
    group: 'creators_agency',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'creator_goals', notNullColumn: 'creator_id' }],
  },
  {
    id: 'creator_reviews',
    label: 'Creator Reviews',
    description: 'Caller reviews of creators.',
    group: 'creators_agency',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'creator_reviews', notNullColumn: 'id' }],
  },
  {
    id: 'user_daily_rewards',
    label: 'Daily Rewards',
    description: 'Streak / daily reward progress.',
    group: 'creators_agency',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'user_daily_rewards', notNullColumn: 'user_id' }],
  },
  {
    id: 'coin_packages',
    label: 'Coin Packages',
    description: 'Store SKU / coin package catalog.',
    group: 'cms_catalog',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'coin_packages', notNullColumn: 'id' }],
  },
  {
    id: 'virtual_gifts_catalog',
    label: 'Virtual Gifts Catalog',
    description: 'Resets system gift catalog JSON and deletes gift-type messages.',
    group: 'cms_catalog',
    confirmPhrase: 'DELETE',
    special: 'virtual_gifts_reset',
  },
  {
    id: 'home_banners',
    label: 'Home Banners',
    description: 'CMS hero banners.',
    group: 'cms_catalog',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'home_banners', notNullColumn: 'id' }],
  },
  {
    id: 'home_quick_links',
    label: 'Home Quick Links',
    description: 'CMS home shortcuts.',
    group: 'cms_catalog',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'home_quick_links', notNullColumn: 'id' }],
  },
  {
    id: 'cms_policies',
    label: 'CMS Policies',
    description: 'Terms / policy documents.',
    group: 'cms_catalog',
    confirmPhrase: 'DELETE',
    tables: [{ name: 'cms_policies', notNullColumn: 'id' }],
  },
  {
    id: 'r2_user_media',
    label: 'R2 User Media Prefixes',
    description:
      'Deletes avatars, gallery, chat_media, verification, intro videos under uploads/* prefixes.',
    group: 'media_r2',
    confirmPhrase: 'DELETE',
    r2Mode: 'user_media_prefixes',
  },
  {
    id: 'r2_all_uploads',
    label: 'R2 All Uploads/',
    description: 'Deletes every object under the uploads/ prefix in the R2 bucket.',
    group: 'media_r2',
    confirmPhrase: 'DELETE R2',
    r2Mode: 'all_uploads',
  },
];

export function getModulePurgeDef(id: string): ModulePurgeDef | undefined {
  return MODULE_PURGE_CATALOG.find((m) => m.id === id);
}

async function countTable(
  client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: string,
  notNullColumn: string
): Promise<number | null> {
  try {
    const { count, error } = await (client.from(table) as any)
      .select(notNullColumn, { count: 'exact', head: true })
      .not(notNullColumn, 'is', null);
    if (error) return null;
    return typeof count === 'number' ? count : 0;
  } catch {
    return null;
  }
}

export async function inventoryModulePurge(): Promise<{
  success: boolean;
  modules: Array<{
    id: ModulePurgeId;
    label: string;
    group: ModulePurgeGroup;
    financeRisk?: boolean;
    confirmPhrase: string;
    rowCount: number | null;
    detail?: string;
  }>;
  error?: string;
}> {
  if (!isSupabaseAdminConfigured() || !isSupabaseSecretConfigured()) {
    return {
      success: false,
      modules: [],
      error: 'Supabase secret-key admin is required for module inventory.',
    };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, modules: [], error: 'Supabase admin client unavailable.' };
  }

  const modules = [];
  for (const def of MODULE_PURGE_CATALOG) {
    let rowCount: number | null = 0;
    let detail: string | undefined;

    if (def.special === 'finance_rpc') {
      const tables = [
        'settlement_events',
        'settlement_line_items',
        'settlement_batches',
        'creator_period_snapshots',
        'financial_ledger',
        'settlement_periods',
      ];
      let sum = 0;
      let anyNull = false;
      const parts: string[] = [];
      for (const t of tables) {
        const c = await countTable(client, t, 'id');
        if (c === null) anyNull = true;
        else {
          sum += c;
          if (c > 0) parts.push(`${t}:${c}`);
        }
      }
      rowCount = anyNull && sum === 0 ? null : sum;
      detail = parts.join(', ') || undefined;
    } else if (def.r2Mode) {
      rowCount = null;
      detail = def.r2Mode === 'all_uploads' ? 'uploads/' : 'uploads/{avatar,gallery,…}/';
    } else if (def.special === 'reset_caller_coins' || def.special === 'reset_creator_earnings') {
      rowCount = await countTable(client, 'profiles', 'id');
      detail = 'profiles rows (balances reset, not deleted)';
    } else if (def.special === 'virtual_gifts_reset') {
      const giftMsgs = await countTable(client, 'messages', 'id');
      rowCount = giftMsgs;
      detail = 'gift messages + system_configs catalog reset';
    } else if (def.tables?.length) {
      let sum = 0;
      let anyNull = false;
      for (const t of def.tables) {
        const c = await countTable(client, t.name, t.notNullColumn);
        if (c === null) anyNull = true;
        else sum += c;
      }
      rowCount = anyNull && sum === 0 ? null : sum;
    }

    modules.push({
      id: def.id,
      label: def.label,
      group: def.group,
      financeRisk: def.financeRisk,
      confirmPhrase: def.confirmPhrase,
      rowCount,
      detail,
    });
  }

  return { success: true, modules };
}

async function writePurgeAudit(params: {
  actorUserId: string;
  moduleId: string;
  confirmPhrase: string;
  tablesCleared: string[];
  r2DeletedCount: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  const client = getSupabaseAdmin();
  if (!client) return;
  try {
    await (client.from('admin_data_purge_log') as any).insert({
      actor_user_id: params.actorUserId || null,
      module_id: params.moduleId,
      confirm_phrase: params.confirmPhrase,
      tables_cleared: params.tablesCleared,
      r2_deleted_count: params.r2DeletedCount,
      success: params.success,
      error_message: params.errorMessage || null,
      metadata: params.metadata || {},
    });
  } catch (err: any) {
    console.warn('[module-purge] audit log insert failed:', err?.message || err);
  }
}

export async function executeModulePurge(params: {
  moduleId: string;
  confirmPhrase: string;
  actorUserId: string;
}): Promise<{
  success: boolean;
  moduleId: string;
  cleared: string[];
  r2DeletedCount: number;
  error?: string;
}> {
  const def = getModulePurgeDef(params.moduleId);
  if (!def) {
    return {
      success: false,
      moduleId: params.moduleId,
      cleared: [],
      r2DeletedCount: 0,
      error: `Unknown module: ${params.moduleId}`,
    };
  }

  const typed = String(params.confirmPhrase || '').trim().toUpperCase();
  const required = def.confirmPhrase.toUpperCase();
  if (typed !== required) {
    return {
      success: false,
      moduleId: def.id,
      cleared: [],
      r2DeletedCount: 0,
      error: `Confirmation phrase mismatch. Type exactly: ${def.confirmPhrase}`,
    };
  }

  if (!isSupabaseAdminConfigured() || !isSupabaseSecretConfigured()) {
    return {
      success: false,
      moduleId: def.id,
      cleared: [],
      r2DeletedCount: 0,
      error: 'Supabase secret-key admin is required.',
    };
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return {
      success: false,
      moduleId: def.id,
      cleared: [],
      r2DeletedCount: 0,
      error: 'Supabase admin client unavailable.',
    };
  }

  const cleared: string[] = [];
  let r2DeletedCount = 0;
  const failed: string[] = [];

  try {
    if (def.r2Mode) {
      clearLocalMediaCache();
      const purgeRes = await purgeR2MediaUploads({
        purgeAllUploads: def.r2Mode === 'all_uploads',
        prefixes: def.r2Mode === 'user_media_prefixes' ? DEFAULT_R2_USER_PREFIXES : undefined,
      });
      r2DeletedCount = purgeRes.deletedCount;
      cleared.push(
        def.r2Mode === 'all_uploads'
          ? `r2:uploads/ (${r2DeletedCount})`
          : `r2:user_media_prefixes (${r2DeletedCount})`
      );
    } else if (def.special === 'finance_rpc') {
      const { data, error } = await (client as any).rpc('admin_purge_finance_module');
      if (error) {
        failed.push(`finance_rpc: ${error.message}`);
      } else {
        const deleted = (data as any)?.deleted || {};
        for (const [k, v] of Object.entries(deleted)) {
          cleared.push(`${k} (${v})`);
        }
        if (cleared.length === 0) cleared.push('finance_settlements');
      }
    } else if (def.special === 'virtual_gifts_reset') {
      const { VIRTUAL_GIFTS } = await import('../src/constants/appDefaults');
      const { error: giftMsgErr } = await (client as any).from('messages').delete().eq('type', 'gift');
      if (giftMsgErr) failed.push(`gift_messages: ${giftMsgErr.message}`);
      else cleared.push('gift_messages');
      const { error: sysErr } = await (client as any)
        .from('system_configs')
        .update({
          enable_virtual_gifts: true,
          virtual_gifts_json: JSON.stringify(VIRTUAL_GIFTS),
        })
        .eq('id', 'default');
      if (sysErr) failed.push(`virtual_gifts_json: ${sysErr.message}`);
      else cleared.push('system_configs.virtual_gifts_json');
    } else if (def.special === 'reset_caller_coins') {
      const { error } = await (client.from('profiles') as any)
        .update({ coin_balance: 0 })
        .not('id', 'is', null);
      if (error) failed.push(`reset_caller_coins: ${error.message}`);
      else cleared.push('profiles.coin_balance=0');
    } else if (def.special === 'reset_creator_earnings') {
      const { error } = await (client.from('profiles') as any)
        .update({
          earnings_coins: 0,
          total_lifetime_earned_usd: 0,
          total_calls_hosted: 0,
          total_call_minutes: 0,
        })
        .not('id', 'is', null);
      if (error) failed.push(`reset_creator_earnings: ${error.message}`);
      else cleared.push('profiles.earnings_reset');
    } else if (def.tables?.length) {
      for (const t of def.tables) {
        const { error } = await (client.from(t.name) as any)
          .delete()
          .not(t.notNullColumn, 'is', null);
        if (error) failed.push(`${t.name}: ${error.message}`);
        else cleared.push(t.name);
      }
    }

    const success = failed.length === 0;
    await writePurgeAudit({
      actorUserId: params.actorUserId,
      moduleId: def.id,
      confirmPhrase: def.confirmPhrase,
      tablesCleared: cleared,
      r2DeletedCount,
      success,
      errorMessage: success ? undefined : failed.join('; '),
      metadata: { financeRisk: Boolean(def.financeRisk) },
    });

    if (!success) {
      return {
        success: false,
        moduleId: def.id,
        cleared,
        r2DeletedCount,
        error: failed.join('; '),
      };
    }

    return { success: true, moduleId: def.id, cleared, r2DeletedCount };
  } catch (err: any) {
    const message = err?.message || String(err);
    await writePurgeAudit({
      actorUserId: params.actorUserId,
      moduleId: def.id,
      confirmPhrase: def.confirmPhrase,
      tablesCleared: cleared,
      r2DeletedCount,
      success: false,
      errorMessage: message,
    });
    return {
      success: false,
      moduleId: def.id,
      cleared,
      r2DeletedCount,
      error: message,
    };
  }
}

/** Used by factory reset when wiping users / finance — bypasses immutability triggers. */
export async function purgeFinanceSettlementsForReset(): Promise<{
  success: boolean;
  cleared: string[];
  error?: string;
}> {
  if (!isSupabaseAdminConfigured() || !isSupabaseSecretConfigured()) {
    return { success: false, cleared: [], error: 'Supabase secret key required' };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, cleared: [], error: 'No admin client' };

  const { data, error } = await (client as any).rpc('admin_purge_finance_module');
  if (error) return { success: false, cleared: [], error: error.message };
  const deleted = (data as any)?.deleted || {};
  const cleared = Object.entries(deleted).map(([k, v]) => `${k} (${v})`);
  return { success: true, cleared };
}
