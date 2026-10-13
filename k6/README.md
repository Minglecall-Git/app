# Load tests (k6)

Acceptance targets from `docs/architecture_engineering_rules.md`:

| Scenario | Script | Target |
| --- | --- | --- |
| Presence | `presence_heartbeat.js` | 10k VUs, jittered 30s, near-zero Postgres presence writes |
| Auth/profile burst | `auth_profile_burst.js` | 500–1000 RPS, p95 ≤ 300ms |
| Chat | `chat_send.js` | API p95 ≤ 500ms |
| Reconnect storm | `reconnect_storm.js` | 5k reconnect / ~30s |
| Billing burn | `billing_burn.js` | 1k parallel burns, zero duplicate `CALL_DEBIT` |
| Billing gift | `billing_gift.js` | Shared idempotency key, zero double-debits |

Install [k6](https://k6.io), then:

```bash
k6 run -e BASE_URL=https://your-staging.vercel.app -e TOKEN="<supabase_jwt>" k6/presence_heartbeat.js
```

After billing runs, verify in Supabase:

```sql
SELECT call_id, billing_minute, transaction_type, user_id, COUNT(*)
FROM wallet_ledger
WHERE call_id = '<call_id>'
GROUP BY 1,2,3,4
HAVING COUNT(*) > 1;
```
