/**
 * Concurrent call burns — assert no duplicate CALL_DEBIT rows (verify in DB after run).
 *
 *   k6 run -e BASE_URL=... -e TOKEN=... -e CALL_ID=... k6/billing_burn.js
 *
 * All VUs burn the SAME callId:billingMinute to prove idempotency.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 1000),
  iterations: Number(__ENV.VUS || 1000),
  thresholds: {
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';
const CALL_ID = __ENV.CALL_ID || '';
const MINUTE = Number(__ENV.BILLING_MINUTE || 1);

export default function () {
  if (!TOKEN || !CALL_ID) {
    sleep(0.1);
    return;
  }
  const res = http.post(
    `${BASE}/api/calls/burn`,
    JSON.stringify({ callId: CALL_ID, billingMinute: MINUTE }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );
  check(res, {
    'burn ok or insufficient': (r) => r.status === 200 || r.status === 400 || r.status === 403,
  });
}
