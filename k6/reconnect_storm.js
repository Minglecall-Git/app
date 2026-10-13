/**
 * Simulate reconnect storms: many clients hit presence + health in a short window.
 *
 *   k6 run -e BASE_URL=... -e TOKEN=... k6/reconnect_storm.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: Number(__ENV.PEAK || 5000) },
        { duration: '20s', target: Number(__ENV.PEAK || 5000) },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.1'],
  },
};

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: TOKEN ? `Bearer ${TOKEN}` : '',
  };
  const h = http.get(`${BASE}/api/health`);
  const p = http.post(
    `${BASE}/api/presence/heartbeat`,
    JSON.stringify({ status: 'online', peerIds: [], durable: false }),
    { headers }
  );
  check(h, { 'health': (r) => r.status < 500 });
  check(p, { 'presence': (r) => r.status < 500 });
  sleep(0.5);
}
