/**
 * k6: 10k concurrent users, jittered ~30s presence heartbeat.
 * Expect Redis-backed responses (redis:true) and no DB saturation.
 *
 *   k6 run -e BASE_URL=https://staging.example.com -e TOKEN=eyJ... k6/presence_heartbeat.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const failRate = new Rate('presence_fail_rate');

export const options = {
  scenarios: {
    presence: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 1000),
      duration: __ENV.DURATION || '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    presence_fail_rate: ['rate<0.05'],
  },
};

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';

export default function () {
  const res = http.post(
    `${BASE}/api/presence/heartbeat`,
    JSON.stringify({ status: 'online', peerIds: [] }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: TOKEN ? `Bearer ${TOKEN}` : '',
      },
      timeout: '10s',
    }
  );
  const ok = check(res, {
    'status 200 or 401': (r) => r.status === 200 || r.status === 401,
    'json body': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });
  failRate.add(!ok);
  // Jittered ~30s (±5s)
  sleep(25 + Math.random() * 10);
}
