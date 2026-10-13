/**
 * DB-only granular reset for Vercel (no in-memory / WebSocket side effects).
 * Mirrors server/supabaseAdmin.granularResetSupabaseAdmin table ops.
 */
async function granularResetDb(client, options = {}) {
  const clearedTables = [];
  const failedOps = [];
  const warnings = [];

  const recordDelete = (table, error) => {
    if (!error) {
      clearedTables.push(table);
      return;
    }
    failedOps.push(`${table}: ${error.message}`);
  };

  const deleteAllRows = (table, notNullColumn) =>
    client.from(table).delete().not(notNullColumn, 'is', null);

  const purgeWalletLedger =
    Boolean(options.walletLedger) ||
    Boolean(options.callLogs) ||
    Boolean(options.clearAllUsers) ||
    Boolean(options.resetBalances?.callerCoins) ||
    Boolean(options.resetBalances?.creatorEarnings);

  const r2PurgeRequested = Boolean(options.purgeR2MediaStorage || options.purgeAllR2Uploads);
  // Never delete R2 objects from serverless — filesystem/S3 bulk purge is not implemented here.
  // Callers must treat r2Purged === false as authoritative (do not claim media was deleted).
  if (r2PurgeRequested) {
    warnings.push(
      'R2 media was NOT deleted. Vercel granular-reset is database-only; clear the bucket in Cloudflare R2 if required.'
    );
  }

  if (options.virtualGiftsCatalog) {
    const { error: giftMsgErr } = await client.from('messages').delete().eq('type', 'gift');
    recordDelete('gift_messages', giftMsgErr);
    const { error: sysErr } = await client
      .from('system_configs')
      .update({ enable_virtual_gifts: true })
      .eq('id', 'default');
    recordDelete('system_configs.virtual_gifts_json', sysErr);
  }

  if (options.chatMessages || options.clearAllUsers) {
    const { error } = await deleteAllRows('messages', 'id');
    recordDelete('messages', error);
    const { error: clearsErr } = await deleteAllRows('message_conversation_clears', 'user_id');
    recordDelete('message_conversation_clears', clearsErr);
  }

  if (purgeWalletLedger) {
    const { error } = await deleteAllRows('wallet_ledger', 'id');
    recordDelete('wallet_ledger', error);
  }

  if (options.callLogs || options.clearAllUsers) {
    const { error } = await deleteAllRows('call_logs', 'id');
    recordDelete('call_logs', error);
  }

  if (options.callLogs || options.chatMessages || options.clearAllUsers) {
    const { error } = await deleteAllRows('matches', 'id');
    recordDelete('matches', error);
  }

  if (options.friendRequests || options.clearAllUsers) {
    const { error } = await deleteAllRows('friend_requests', 'id');
    recordDelete('friend_requests', error);
  }

  if (options.payoutRequests || options.clearAllUsers) {
    const { error } = await deleteAllRows('payout_requests', 'id');
    recordDelete('payout_requests', error);
  }

  if (options.moderationReports || options.clearAllUsers) {
    const { error } = await deleteAllRows('moderation_reports', 'id');
    recordDelete('moderation_reports', error);
  }

  if (options.feedPosts || options.clearAllUsers) {
    const { error: likesErr } = await deleteAllRows('feed_post_likes', 'post_id');
    recordDelete('feed_post_likes', likesErr);
    const { error } = await deleteAllRows('feed_posts', 'id');
    recordDelete('feed_posts', error);
  }

  if (options.homeBanners) {
    const { error } = await deleteAllRows('home_banners', 'id');
    recordDelete('home_banners', error);
  }
  if (options.homeQuickLinks) {
    const { error } = await deleteAllRows('home_quick_links', 'id');
    recordDelete('home_quick_links', error);
  }
  if (options.cmsPolicies) {
    const { error } = await deleteAllRows('cms_policies', 'id');
    recordDelete('cms_policies', error);
  }
  if (options.systemSettings) {
    const { error } = await deleteAllRows('system_configs', 'id');
    recordDelete('system_configs', error);
  }
  if (options.coinPackages) {
    const { error } = await deleteAllRows('coin_packages', 'id');
    recordDelete('coin_packages', error);
  }

  if (options.favorites || options.clearAllUsers) {
    const { error } = await deleteAllRows('favorites', 'user_id');
    recordDelete('favorites', error);
  }
  if (options.blockedUsers || options.clearAllUsers) {
    const { error } = await deleteAllRows('blocked_users', 'user_id');
    recordDelete('blocked_users', error);
  }
  if (options.creatorGoals || options.clearAllUsers) {
    const { error } = await deleteAllRows('creator_goals', 'creator_id');
    recordDelete('creator_goals', error);
  }
  if (options.creatorAnalytics || options.clearAllUsers) {
    const { error } = await deleteAllRows('creator_metrics', 'creator_id');
    recordDelete('creator_metrics', error);
  }
  if (options.creatorReviews || options.clearAllUsers) {
    const { error } = await deleteAllRows('creator_reviews', 'id');
    recordDelete('creator_reviews', error);
  }

  if (options.taxonomiesAndFlags) {
    for (const b of [
      { table: 'country_configs', filter: 'code' },
      { table: 'language_configs', filter: 'code' },
      { table: 'zodiac_configs', filter: 'key' },
      { table: 'interest_configs', filter: 'id' },
      { table: 'currency_configs', filter: 'code' },
    ]) {
      const { error } = await deleteAllRows(b.table, b.filter);
      recordDelete(b.table, error);
    }
    if (!options.moderationReports && !options.clearAllUsers) {
      const { error } = await deleteAllRows('moderation_reports', 'id');
      recordDelete('moderation_reports', error);
    }
  }

  if (options.clearAllUsers || options.creatorGoals || options.dailyRewardsAndQuests) {
    const { error } = await deleteAllRows('user_daily_rewards', 'user_id');
    recordDelete('user_daily_rewards', error);
  }

  if (options.resetBalances && !options.clearAllUsers) {
    const updates = {};
    if (options.resetBalances.callerCoins) updates.coin_balance = 0;
    if (options.resetBalances.creatorEarnings) {
      updates.earnings_coins = 0;
      updates.total_lifetime_earned_usd = 0;
      updates.total_calls_hosted = 0;
      updates.total_call_minutes = 0;
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await client.from('profiles').update(updates).not('id', 'is', null);
      recordDelete('balances_reset', error);
    }
  }

  const profileIdsToDelete =
    options.mockIds && options.mockIds.length > 0 ? options.mockIds.map(String) : [];
  const AUTH_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (options.clearAllUsers || profileIdsToDelete.length > 0) {
    let targets = [];
    if (options.clearAllUsers) {
      const { data: nonAdmins, error: listErr } = await client
        .from('profiles')
        .select('id, auth_id')
        .neq('role', 'admin');
      if (listErr) failedOps.push(`profiles_list_for_auth_purge: ${listErr.message}`);
      else targets = nonAdmins || [];
    } else {
      const { data: listed, error: listErr } = await client
        .from('profiles')
        .select('id, auth_id')
        .in('id', profileIdsToDelete);
      if (listErr) {
        failedOps.push(`profiles_list_for_auth_purge: ${listErr.message}`);
        targets = profileIdsToDelete.map((id) => ({ id, auth_id: null }));
      } else {
        targets = listed || [];
        for (const id of profileIdsToDelete) {
          if (!targets.some((t) => t.id === id)) targets.push({ id, auth_id: null });
        }
      }
    }

    let authDeleted = 0;
    for (const row of targets) {
      const candidates = Array.from(
        new Set(
          [row.auth_id, AUTH_UUID_RE.test(row.id) ? row.id : null].filter(Boolean).map(String)
        )
      );
      for (const aid of candidates) {
        try {
          const { error: authErr } = await client.auth.admin.deleteUser(aid);
          if (authErr) {
            const msg = authErr.message || String(authErr);
            if (/not found|user not found|does not exist/i.test(msg)) authDeleted++;
            else warnings.push(`Auth delete ${aid}: ${msg}`);
          } else authDeleted++;
        } catch (err) {
          warnings.push(`Auth delete ${aid}: ${(err && err.message) || String(err)}`);
        }
      }
    }
    if (targets.length > 0) {
      clearedTables.push(
        `auth.users (~${authDeleted} deletes for ${targets.length} non-admin profiles)`
      );
    }

    if (options.clearAllUsers) {
      const { error } = await client.from('profiles').delete().neq('role', 'admin');
      recordDelete('profiles (all non-admin users)', error);
    } else if (profileIdsToDelete.length > 0) {
      const { error } = await client.from('profiles').delete().in('id', profileIdsToDelete);
      recordDelete(`profiles (${profileIdsToDelete.length} users)`, error);
    }
  }

  if (options.clearAdmin) {
    const { data: admins, error: adminLookupErr } = await client
      .from('profiles')
      .select('id')
      .eq('role', 'admin');
    if (adminLookupErr) failedOps.push(`admin_profile_reset: ${adminLookupErr.message}`);
    else if (admins && admins.length > 0) {
      for (const admin of admins) {
        const { error: adminUpdateErr } = await client
          .from('profiles')
          .update({
            name: 'Super Admin',
            is_verified: true,
            online_status: 'online',
            updated_at: new Date().toISOString(),
          })
          .eq('id', admin.id);
        if (adminUpdateErr) {
          failedOps.push(`admin_profile_reset(${admin.id}): ${adminUpdateErr.message}`);
        }
      }
      clearedTables.push('admin_profile_fields_reset');
    } else {
      clearedTables.push('admin_profile_reset_skipped_no_admin');
    }
  }

  if (failedOps.length > 0) {
    return {
      success: false,
      clearedTables,
      warnings,
      r2PurgeRequested,
      r2Purged: false,
      error: `Some reset operations failed: ${failedOps.join('; ')}`,
    };
  }
  return {
    success: true,
    clearedTables,
    warnings,
    r2PurgeRequested,
    r2Purged: false,
  };
}

function isFactoryResetAllowed() {
  const raw = String(process.env.ALLOW_FACTORY_RESET || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

module.exports = { granularResetDb, isFactoryResetAllowed };
