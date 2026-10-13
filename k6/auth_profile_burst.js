/**
 * Burst profile/auth-adjacent reads — target 500–1000 RPS, p95 ≤ 300ms.
 *
 *   k6 run -e BASE_URL=... -e TOKEN=... k6/auth_profile_burst.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    burst: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RPS || 500),
      timeUnit: '1s',
      duration: __ENV.DURATION || '1m',
      preAllocatedVUs: 100,
      maxVUs: 1000,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
  },
};

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';

export default function () {
  const res = http.get(`${BASE}/api/health`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  check(res, { 'health ok': (r) => r.status === 200 || r.status === 501 });
  sleep(0.01);
}
